import crypto from 'crypto';
import { Translation, TranslationModel, TranslationKind } from '../models/translation';
import { TranslationBudgetModel } from '../models/translation-budget';
import { TranslationProvider } from './translation-provider';
import { GoogleTranslationProvider } from './google-translation-provider';
import { tokenizeReferences, restoreReferences } from './translation-token-safety';

// Cache + budget + provider orchestration (spec/user-content-translation-impl.md
// §4.2). Controllers stay thin: this owns the cache lookup, budget check,
// provider call, upsert, and accounting.

export class TranslationBudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationBudgetExceeded';
  }
}

export interface TranslateInput {
  kind: TranslationKind;
  refId: string;
  sourceText: string;
  sourceLang: string | null;
  targetLang: string;
  // Reference tokens ({{blueprint:id}}/{{user:id}}) must round-trip intact —
  // only comment bodies carry them.
  hasReferenceTokens?: boolean;
}

export interface TranslateResult {
  translatedText: string;
  sourceLang: string | null;
  cached: boolean;
  provider: string;
  degraded?: boolean;
}

// zh-Hans/ru/ko/en are the site's four UI locales (lib/blueprint/translation.ts);
// Google's target codes differ for Chinese.
const PROVIDER_LANG_BY_TARGET: Record<string, string> = {
  'zh-Hans': 'zh-CN',
};

function providerLang(targetLang: string): string {
  return PROVIDER_LANG_BY_TARGET[targetLang] ?? targetLang;
}

// The site's four target locales collapse to these base languages for the
// same-language shortcut: a Chinese description shown to a zh-Hans viewer
// needs no translation, regardless of script variant bookkeeping.
const BASE_LANG_BY_TARGET: Record<string, string> = {
  'zh-Hans': 'zh',
};

function baseLangOfTarget(targetLang: string): string {
  return BASE_LANG_BY_TARGET[targetLang] ?? targetLang;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

// eslint-disable-next-line no-control-regex
const ASCII_ONLY = /^[\x00-\x7F]*$/;

export class TranslationService {
  private static _instance: TranslationService | null = null;
  public static get instance(): TranslationService {
    if (this._instance == null) this._instance = new TranslationService();
    return this._instance;
  }
  public static setInstanceForTest(instance: TranslationService | null) {
    this._instance = instance;
  }

  constructor(private provider: TranslationProvider = new GoogleTranslationProvider()) {}

  public isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  private monthKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private dayKey(date = new Date()): string {
    return `${this.monthKey(date)}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  // A malformed env value must fall back to the default, not silently disable
  // the budget: parseInt('abc') is NaN, and NaN compares false to everything.
  private envInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private monthlyBudget(): number {
    return this.envInt(process.env.MONTHLY_CHAR_BUDGET, 400000);
  }

  private perUserDailyCap(): number {
    return this.envInt(process.env.MAX_TRANSLATIONS_PER_USER_PER_DAY, 200);
  }

  // Throws before any provider call is made when the site is already over its
  // monthly character budget, or (when userId is given) the caller has hit
  // their daily uncached-call cap. Cache reads never go through this check.
  private async checkBudget(userId: string | null): Promise<void> {
    const month = this.monthKey();
    const siteBudget = await TranslationBudgetModel.model
      .findOne({ month, userId: null })
      .select('charCount')
      .lean();
    if ((siteBudget?.charCount ?? 0) >= this.monthlyBudget()) {
      throw new TranslationBudgetExceeded('Monthly translation budget exceeded');
    }

    if (userId != null) {
      const day = this.dayKey();
      const userUsage = await TranslationBudgetModel.model
        .findOne({ month, userId, day })
        .select('requestCount')
        .lean();
      if ((userUsage?.requestCount ?? 0) >= this.perUserDailyCap()) {
        throw new TranslationBudgetExceeded('Daily translation limit exceeded for this user');
      }
    }
  }

  private async recordSpend(charCount: number, requestCount: number, userId: string | null): Promise<void> {
    const month = this.monthKey();
    await TranslationBudgetModel.model.updateOne(
      { month, userId: null },
      { $inc: { charCount, requestCount } },
      { upsert: true }
    );
    if (userId != null) {
      const day = this.dayKey();
      await TranslationBudgetModel.model.updateOne(
        { month, userId, day },
        { $inc: { charCount, requestCount } },
        { upsert: true }
      );
    }
  }

  private async findCached(
    kind: TranslationKind,
    refId: string,
    targetLang: string,
    sourceHash: string
  ): Promise<Translation | null> {
    const row = await TranslationModel.model.findOne({ kind, refId, targetLang });
    if (row == null) return null;
    // A human row always wins and is never treated as stale by a source edit
    // (phase 4 forward-compat).
    if (row.provider === 'human') return row;
    if (row.sourceHash !== sourceHash) return null;
    return row;
  }

  // Translates a batch of inputs sharing one targetLang in as few provider
  // calls as possible (comment "translate all" is naturally a batch; a single
  // blueprint description is a batch of one). userId drives the per-user
  // daily cap — pass null for anonymous/system callers.
  public async translateMany(inputs: TranslateInput[], userId: string | null): Promise<TranslateResult[]> {
    const results: (TranslateResult | undefined)[] = new Array(inputs.length);
    const misses: { index: number; input: TranslateInput; sourceHash: string; tokenized: string; tokens: string[] }[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const { kind, refId, sourceText, sourceLang, targetLang } = input;

      // Cheapest possible path — the majority case — and it needs no cache
      // row or provider call at all.
      if (
        (sourceLang != null && sourceLang === baseLangOfTarget(targetLang)) ||
        (sourceLang == null && ASCII_ONLY.test(sourceText))
      ) {
        results[i] = { translatedText: sourceText, sourceLang, cached: true, provider: 'none' };
        continue;
      }

      const sourceHash = sha256(sourceText);
      const cached = await this.findCached(kind, refId, targetLang, sourceHash);
      if (cached != null) {
        results[i] = {
          translatedText: cached.translatedText,
          sourceLang: cached.sourceLang,
          cached: true,
          provider: cached.provider,
        };
        continue;
      }

      const { text: tokenized, tokens } = input.hasReferenceTokens
        ? tokenizeReferences(sourceText)
        : { text: sourceText, tokens: [] as string[] };
      misses.push({ index: i, input, sourceHash, tokenized, tokens });
    }

    if (misses.length > 0) {
      if (!this.isConfigured()) {
        throw new Error('Translation is not configured');
      }
      await this.checkBudget(userId);

      // All misses in this call share targetLang (enforced by callers: one
      // blueprint or one comment thread, one viewer locale) — asserted, not
      // just assumed, since a mixed batch would cache a row translated into
      // the wrong language under a different language's key.
      const targetLang = misses[0].input.targetLang;
      if (misses.some(m => m.input.targetLang !== targetLang)) {
        throw new Error('translateMany requires all inputs to share one targetLang');
      }
      const translated = await this.provider.translate(
        misses.map(m => m.tokenized),
        providerLang(targetLang)
      );
      if (translated.length !== misses.length) {
        throw new Error(
          `Translation provider returned ${translated.length} results for ${misses.length} inputs`
        );
      }

      let spentChars = 0;
      for (const text of misses.map(m => m.tokenized)) spentChars += text.length;

      for (let m = 0; m < misses.length; m++) {
        const { index, input, sourceHash, tokens } = misses[m];
        const raw = translated[m];
        const restored = tokens.length > 0 ? restoreReferences(raw.text, tokens) : raw.text;

        if (restored == null) {
          // Corrupted round-trip: never serve it, never cache it.
          results[index] = {
            translatedText: input.sourceText,
            sourceLang: input.sourceLang,
            cached: false,
            provider: 'google-v2',
            degraded: true,
          };
          continue;
        }

        const detectedSourceLang = raw.detectedSourceLang ?? input.sourceLang ?? null;
        await TranslationModel.model.updateOne(
          { kind: input.kind, refId: input.refId, targetLang: input.targetLang },
          {
            $set: {
              sourceLang: detectedSourceLang,
              sourceHash,
              translatedText: restored,
              provider: 'google-v2',
              charCount: misses[m].tokenized.length,
            },
          },
          { upsert: true }
        );

        results[index] = {
          translatedText: restored,
          sourceLang: detectedSourceLang,
          cached: false,
          provider: 'google-v2',
        };
      }

      await this.recordSpend(spentChars, misses.length, userId);
    }

    return results as TranslateResult[];
  }

  public async translateOne(input: TranslateInput, userId: string | null): Promise<TranslateResult> {
    const [result] = await this.translateMany([input], userId);
    return result;
  }
}
