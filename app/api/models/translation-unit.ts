import mongoose, { Document, Model, Schema } from 'mongoose';
import { TRANSLATION_TARGET_LANGS } from '../../../lib/index';

// Durable cache for machine-translated text, keyed by the TEXT ITSELF
// (spec/multilingual-search-plan.md §1) — {textHash, sourceLang, targetLang},
// never by document id. 86 blueprints sharing one title cost one translation,
// and a search query and a blueprint title that carry the same text share one
// row. Rows are disposable — dropping the collection only costs money to
// rebuild. This collection replaces the earlier per-document `translations`
// cache, which never shipped (empty in prod), so the re-key is a schema edit
// rather than a migration.
export type TranslationProviderName = 'google-v2' | 'gemini-3.1-flash-lite' | 'human';
const TRANSLATION_PROVIDERS: TranslationProviderName[] = [
  'google-v2',
  'gemini-3.1-flash-lite',
  'human',
];
export type TranslationMode = 'standard' | 'vi-romanized-title-v1';
export const STANDARD_TRANSLATION_MODE: TranslationMode = 'standard';

// sourceLang key value written while the provider auto-detects. Today EVERY
// row uses it: the Google provider never sees the caller's declared source
// language, so keying on it would bill identical (text, target) pairs twice.
// The column exists so a future provider that honors a source hint can start
// writing real codes — new keys, no migration.
export const AUTO_SOURCE_LANG = 'auto';

export interface TranslationUnit extends Omit<Document, 'model'> {
  // sha256 of the source text, first 16 hex chars — the cache key. Freshness
  // needs no separate field: a source edit changes the hash, which is a new
  // key, so a stale row is simply never found again.
  textHash: string;
  // Declared source language at translate time, or 'auto' when unknown.
  sourceLang: string;
  targetLang: string;
  mode: TranslationMode;
  // What the provider reported the source actually was (null for human rows
  // and providers that don't detect).
  detectedSourceLang: string | null;
  translatedText: string;
  provider: TranslationProviderName;
  charCount: number;
  promptVersion?: string | null;
  model?: string | null;
  restoredSourceText?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  // Phase 4 (deferred): human-submitted corrections. null = machine.
  reviewedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TranslationUnitModel {
  static model: Model<TranslationUnit>;

  public static init() {
    const translationUnitSchema = new mongoose.Schema(
      {
        textHash: { type: String, required: true },
        sourceLang: { type: String, required: true },
        targetLang: { type: String, enum: TRANSLATION_TARGET_LANGS, required: true },
        mode: {
          type: String,
          enum: ['standard', 'vi-romanized-title-v1'],
          default: STANDARD_TRANSLATION_MODE,
          required: true,
        },
        detectedSourceLang: { type: String, default: null },
        translatedText: { type: String, required: true },
        provider: { type: String, enum: TRANSLATION_PROVIDERS, required: true },
        charCount: { type: Number, required: true },
        promptVersion: { type: String, default: null },
        model: { type: String, default: null },
        restoredSourceText: { type: String, default: null },
        inputTokens: { type: Number, default: null },
        outputTokens: { type: Number, default: null },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      },
      { timestamps: true }
    );

    // Unnamed on purpose: Mongo's generated name is what
    // migrations/20260805000000_translation-unit-modes.js creates too, so
    // autoIndex and the migration cannot disagree about it. Pinning a
    // friendlier name here means pinning the identical string there as well,
    // or whichever runs second dies with "Index already exists with a
    // different name".
    translationUnitSchema.index(
      { textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 },
      { unique: true }
    );

    TranslationUnitModel.model =
      (mongoose.models['TranslationUnit'] as Model<TranslationUnit>) ??
      mongoose.model<TranslationUnit>('TranslationUnit', translationUnitSchema);
  }
}
