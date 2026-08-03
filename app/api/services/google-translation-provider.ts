import { Translate } from '@google-cloud/translate/build/src/v2';
import { TranslatedText, TranslationProvider } from './translation-provider';

// google-translate-v2 wrapper. `key` auth (API key), matching the research
// doc's provider choice — not a service account. format: 'text' always: HTML
// mode would reintroduce an escaping surface the reference-token safety net
// (translation-token-safety.ts) is specifically built to avoid.
interface TranslationsResponseBody {
  data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
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
    const [translations, apiResponse] = (await client.translate(texts, {
      to: targetLang,
      format: 'text',
    })) as [string[], TranslationsResponseBody];

    const detected = apiResponse?.data?.translations ?? [];
    return translations.map((text, i) => ({
      text,
      detectedSourceLang: detected[i]?.detectedSourceLanguage,
    }));
  }
}
