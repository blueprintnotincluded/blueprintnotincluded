import { Translate } from '@google-cloud/translate/build/src/v2';
import { TranslatedText, TranslationProvider } from './translation-provider';

// google-translate-v2 wrapper. `key` auth (API key), matching the research
// doc's provider choice — not a service account. format: 'text' always: HTML
// mode would reintroduce an escaping surface the reference-token safety net
// (translation-token-safety.ts) is specifically built to avoid.
interface TranslationsResponseBody {
  data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
}

// The v2 client's public typings expose no per-call timeout/retry override
// (those live on the underlying gax CallOptions, undocumented for this
// wrapper), so a stalled request would otherwise hang indefinitely. A manual
// race against a timer is the dependency-free way to bound it.
const DEFAULT_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Translation request timed out after ${ms}ms`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export class GoogleTranslationProvider implements TranslationProvider {
  private client: Translate | null = null;

  public isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_TRANSLATE_API_KEY);
  }

  private getClient(): Translate {
    if (!this.isConfigured()) {
      throw new Error('GOOGLE_TRANSLATE_API_KEY is not set — translation is unavailable');
    }
    if (this.client == null) {
      this.client = new Translate({ key: process.env.GOOGLE_TRANSLATE_API_KEY });
    }
    return this.client;
  }

  public async translate(texts: string[], targetLang: string): Promise<TranslatedText[]> {
    if (texts.length === 0) return [];
    const client = this.getClient();
    // Same guard as TranslationService.envInt: a malformed or negative env
    // value falls back to the default rather than reaching setTimeout.
    const parsedTimeout = parseInt(process.env.GOOGLE_TRANSLATE_TIMEOUT_MS || '', 10);
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;
    const [translations, apiResponse] = (await withTimeout(
      client.translate(texts, { to: targetLang, format: 'text' }),
      timeoutMs
    )) as [string[], TranslationsResponseBody];

    const detected = apiResponse?.data?.translations ?? [];
    return translations.map((text, i) => ({
      text,
      detectedSourceLang: detected[i]?.detectedSourceLanguage,
    }));
  }
}
