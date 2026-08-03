// Provider abstraction over the machine translation backend (mirrors
// AvatarImageProvider / GeminiAvatarProvider — controllers/services never
// call the Google SDK directly). Batch-capable by design: a comment thread
// translation is naturally a batch of texts in one call.

export interface TranslatedText {
  text: string;
  detectedSourceLang?: string;
}

export interface TranslationProvider {
  isConfigured(): boolean;
  translate(texts: string[], targetLang: string): Promise<TranslatedText[]>;
}
