import { TranslatedText, TranslationProvider } from '../../app/api/services/translation-provider';

// Deterministic in-memory provider — no network in tests, ever. Prefixes each
// input with a marker so specs can assert a translation actually happened,
// and can optionally report a detected source language per call.
export class FakeTranslationProvider implements TranslationProvider {
  public configured = true;
  public calls: { texts: string[]; targetLang: string }[] = [];
  public detectedSourceLang: string | undefined = 'fr';
  public failNext = false;

  isConfigured(): boolean {
    return this.configured;
  }

  async translate(texts: string[], targetLang: string): Promise<TranslatedText[]> {
    this.calls.push({ texts, targetLang });
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake provider failure');
    }
    return texts.map(text => ({
      text: `[${targetLang}] ${text}`,
      detectedSourceLang: this.detectedSourceLang,
    }));
  }
}
