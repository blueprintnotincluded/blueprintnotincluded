import mongoose from 'mongoose';
import {
  checkNormalizedBlueprintName,
  MAX_BLUEPRINT_NAME_LENGTH,
  normalizeBlueprintName,
} from '../../../lib/index';
import { TranslationUnitModel } from '../models/translation-unit';
import { TranslationBudgetModel } from '../models/translation-budget';
import { hashSourceText, TranslationBudgetExceeded } from './translation-service';
import {
  GeminiVietnameseTitleProvider,
  VietnameseTitleProvider,
} from './gemini-vietnamese-title-provider';
import {
  conservativeGeminiInputTokens,
  GEMINI_VI_TITLE_BATCH_CHARACTERS,
  GEMINI_VI_TITLE_BATCH_SIZE,
  GEMINI_VI_TITLE_MODE,
  GEMINI_VI_TITLE_MODEL,
  GEMINI_VI_TITLE_PROMPT_VERSION,
  geminiMaximumMicroUsd,
  geminiObservedMicroUsd,
  geminiVietnameseTitleCaps,
  buildVietnameseTitleRequest,
  VietnameseTitleInput,
  VietnameseTitleStatus,
} from './vietnamese-title-prompts';

const ASCII_NONEMPTY = /^[\x20-\x7e]+$/;

export interface VietnameseTitleTranslationOutcome {
  id: string;
  status: VietnameseTitleStatus | 'invalid';
  translatedText?: string;
  restoredVi?: string;
  cached: boolean;
}

function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date = new Date()): string {
  return `${monthKey(date)}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function nonNegativeEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeRomanizedVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameMeaninglessForm(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return normalize(left) === normalize(right);
}

function preservesNumbersAndVersions(source: string, english: string): boolean {
  const numbers = (value: string) => value.match(/\d+(?:\.\d+)*/g) ?? [];
  if (JSON.stringify(numbers(source)) !== JSON.stringify(numbers(english))) return false;
  const markers = source.match(/\b(?:v|ver|version|mk)\s*\d+(?:\.\d+)*/gi) ?? [];
  const normalizedEnglish = english.toLocaleLowerCase('en').replace(/\s+/g, '');
  return markers.every(marker =>
    normalizedEnglish.includes(marker.toLocaleLowerCase('en').replace(/\s+/g, ''))
  );
}

export function isVietnameseTitleFeatureEnabled(): boolean {
  return process.env.GEMINI_VI_TITLE_TRANSLATION_ENABLED === 'true';
}

// The three conditions translateMany itself requires before it will spend.
// Exported because callers need to tell "the gate looked and declined this
// title" apart from "the gate is switched off" — both surface as an 'invalid'
// outcome, but only the second means some other pass should still run.
export function isVietnameseTitleGateActive(): boolean {
  return (
    isVietnameseTitleFeatureEnabled() &&
    !!process.env.GEMINI_API_KEY &&
    nonNegativeEnvInt(process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD, 0) > 0
  );
}

export function vietnameseTitleDryRunCaps(): {
  inputTokens: number;
  outputTokens: number;
  maximumMicroUsd: number;
} {
  const caps = geminiVietnameseTitleCaps();
  return {
    ...caps,
    maximumMicroUsd: geminiMaximumMicroUsd(caps.inputTokens, caps.outputTokens),
  };
}

export class VietnameseTitleTranslationService {
  private static _instance: VietnameseTitleTranslationService | null = null;
  public static get instance(): VietnameseTitleTranslationService {
    if (this._instance == null) this._instance = new VietnameseTitleTranslationService();
    return this._instance;
  }
  public static setInstanceForTest(instance: VietnameseTitleTranslationService | null): void {
    this._instance = instance;
  }

  public constructor(
    private readonly provider: VietnameseTitleProvider = new GeminiVietnameseTitleProvider()
  ) {}

  public async translateOne(
    sourceText: string,
    userId: string | null
  ): Promise<VietnameseTitleTranslationOutcome> {
    const [result] = await this.translateMany([{ id: 'title', text: sourceText }], userId);
    return result;
  }

  public async translateMany(
    inputs: VietnameseTitleInput[],
    userId: string | null
  ): Promise<VietnameseTitleTranslationOutcome[]> {
    this.validateInputs(inputs);
    const outcomes: Array<VietnameseTitleTranslationOutcome | undefined> = new Array(inputs.length);
    const misses: Array<{ index: number; input: VietnameseTitleInput; textHash: string }> = [];

    for (let index = 0; index < inputs.length; index++) {
      const input = inputs[index];
      const textHash = hashSourceText(input.text);
      const cached = await TranslationUnitModel.model.findOne({
        textHash,
        sourceLang: 'vi',
        targetLang: 'en',
        mode: GEMINI_VI_TITLE_MODE,
        provider: GEMINI_VI_TITLE_MODEL,
        promptVersion: GEMINI_VI_TITLE_PROMPT_VERSION,
        model: GEMINI_VI_TITLE_MODEL,
      });
      if (cached != null) {
        outcomes[index] = {
          id: input.id,
          status: 'translated',
          translatedText: cached.translatedText,
          restoredVi: cached.restoredSourceText ?? undefined,
          cached: true,
        };
      } else {
        misses.push({ index, input, textHash });
      }
    }
    if (misses.length === 0) return outcomes as VietnameseTitleTranslationOutcome[];

    if (!isVietnameseTitleGateActive()) return this.declineMisses(outcomes, misses);
    const monthlyCap = nonNegativeEnvInt(process.env.GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD, 0);

    const caps = geminiVietnameseTitleCaps();
    const request = buildVietnameseTitleRequest(
      misses.map(miss => miss.input),
      caps.outputTokens
    );
    if (conservativeGeminiInputTokens(JSON.stringify(request)) > caps.inputTokens) {
      throw new Error('Gemini Vietnamese-title request exceeds the fixed input ceiling');
    }
    const reservation = geminiMaximumMicroUsd(caps.inputTokens, caps.outputTokens);
    await this.reserveBudget(reservation, monthlyCap, userId);

    const batch = await this.provider.translate(misses.map(miss => miss.input));
    await TranslationBudgetModel.model.updateOne(
      { month: monthKey(), userId: null, day: null },
      {
        $inc: {
          geminiObservedMicroUsd: geminiObservedMicroUsd(
            batch.usage.inputTokens,
            batch.usage.outputTokens
          ),
          geminiInputTokens: batch.usage.inputTokens,
          geminiOutputTokens: batch.usage.outputTokens,
        },
      }
    );

    for (let i = 0; i < misses.length; i++) {
      const miss = misses[i];
      const result = batch.results[i];
      const acceptedEnglish =
        result.status === 'translated'
          ? this.acceptedEnglish(miss.input.text, result.restoredVi, result.english)
          : null;
      if (acceptedEnglish == null) {
        outcomes[miss.index] = {
          id: miss.input.id,
          status: result.status === 'translated' ? 'invalid' : result.status,
          cached: false,
        };
        continue;
      }
      await TranslationUnitModel.model.updateOne(
        {
          textHash: miss.textHash,
          sourceLang: 'vi',
          targetLang: 'en',
          mode: GEMINI_VI_TITLE_MODE,
        },
        {
          $set: {
            detectedSourceLang: 'vi',
            translatedText: acceptedEnglish,
            provider: GEMINI_VI_TITLE_MODEL,
            charCount: miss.input.text.length,
            promptVersion: GEMINI_VI_TITLE_PROMPT_VERSION,
            model: GEMINI_VI_TITLE_MODEL,
            restoredSourceText: result.restoredVi,
            inputTokens: batch.usage.inputTokens,
            outputTokens: batch.usage.outputTokens,
          },
        },
        { upsert: true }
      );
      outcomes[miss.index] = {
        id: miss.input.id,
        status: 'translated',
        translatedText: acceptedEnglish,
        restoredVi: result.restoredVi,
        cached: false,
      };
    }
    return outcomes as VietnameseTitleTranslationOutcome[];
  }

  private validateInputs(inputs: VietnameseTitleInput[]): void {
    if (inputs.length === 0 || inputs.length > GEMINI_VI_TITLE_BATCH_SIZE) {
      throw new Error(`Vietnamese-title batch must contain 1-${GEMINI_VI_TITLE_BATCH_SIZE} inputs`);
    }
    const ids = new Set<string>();
    let characters = 0;
    for (const input of inputs) {
      if (!input.id || ids.has(input.id))
        throw new Error('Vietnamese-title input IDs must be unique');
      ids.add(input.id);
      if (!ASCII_NONEMPTY.test(input.text) || input.text.length > MAX_BLUEPRINT_NAME_LENGTH) {
        throw new Error(
          'Vietnamese-title input must be non-empty ASCII within the title length policy'
        );
      }
      characters += input.text.length;
    }
    if (characters > GEMINI_VI_TITLE_BATCH_CHARACTERS) {
      throw new Error(
        `Vietnamese-title batch exceeds ${GEMINI_VI_TITLE_BATCH_CHARACTERS} source characters`
      );
    }
  }

  private acceptedEnglish(source: string, restoredVi: string, english: string): string | null {
    const normalizedEnglish = normalizeBlueprintName(english);
    const accepted =
      normalizeRomanizedVietnamese(restoredVi) === source.replace(/\s+/g, ' ').trim() &&
      normalizedEnglish.length <= MAX_BLUEPRINT_NAME_LENGTH &&
      checkNormalizedBlueprintName(normalizedEnglish).ok &&
      !sameMeaninglessForm(source, normalizedEnglish) &&
      preservesNumbersAndVersions(source, normalizedEnglish);
    return accepted ? normalizedEnglish : null;
  }

  private declineMisses(
    outcomes: Array<VietnameseTitleTranslationOutcome | undefined>,
    misses: Array<{ index: number; input: VietnameseTitleInput }>
  ): VietnameseTitleTranslationOutcome[] {
    for (const miss of misses) {
      outcomes[miss.index] = { id: miss.input.id, status: 'invalid', cached: false };
    }
    return outcomes as VietnameseTitleTranslationOutcome[];
  }

  private async reserveBudget(
    reservation: number,
    cap: number,
    userId: string | null
  ): Promise<void> {
    const month = monthKey();
    const filter = {
      month,
      userId: null,
      day: null,
      $expr: {
        $lte: [{ $add: [{ $ifNull: ['$geminiReservedMicroUsd', 0] }, reservation] }, cap],
      },
    };
    const update = {
      $inc: {
        geminiReservedMicroUsd: reservation,
        geminiRequestCount: 1,
      },
    };
    let reserved = await TranslationBudgetModel.model.updateOne(filter, update);
    if (reserved.modifiedCount === 0) {
      const exists = await TranslationBudgetModel.model.exists({ month, userId: null, day: null });
      if (exists == null && reservation <= cap) {
        try {
          await TranslationBudgetModel.model.create({
            month,
            userId: null,
            day: null,
            geminiReservedMicroUsd: reservation,
            geminiRequestCount: 1,
          });
          reserved = { ...reserved, modifiedCount: 1 } as typeof reserved;
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          reserved = await TranslationBudgetModel.model.updateOne(filter, update);
        }
      }
    }
    if (reserved.modifiedCount === 0) {
      throw new TranslationBudgetExceeded('Monthly Gemini Vietnamese-title budget exceeded');
    }

    if (userId != null) await this.reserveUserRequest(userId, month);
  }

  private async reserveUserRequest(userId: string, month: string): Promise<void> {
    const cap = nonNegativeEnvInt(process.env.MAX_TRANSLATIONS_PER_USER_PER_DAY, 200);
    if (cap === 0)
      throw new TranslationBudgetExceeded('Daily translation limit exceeded for this user');
    const day = dayKey();
    const objectId = new mongoose.Types.ObjectId(userId);
    const filter = {
      month,
      userId: objectId,
      day,
      requestCount: { $lt: cap },
    };
    let reserved = await TranslationBudgetModel.model.updateOne(filter, {
      $inc: { requestCount: 1 },
    });
    if (reserved.modifiedCount === 0) {
      const exists = await TranslationBudgetModel.model.exists({ month, userId: objectId, day });
      if (exists == null) {
        try {
          await TranslationBudgetModel.model.create({
            month,
            userId: objectId,
            day,
            requestCount: 1,
          });
          reserved = { ...reserved, modifiedCount: 1 } as typeof reserved;
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          reserved = await TranslationBudgetModel.model.updateOne(filter, {
            $inc: { requestCount: 1 },
          });
        }
      }
    }
    if (reserved.modifiedCount === 0) {
      throw new TranslationBudgetExceeded('Daily translation limit exceeded for this user');
    }
  }
}
