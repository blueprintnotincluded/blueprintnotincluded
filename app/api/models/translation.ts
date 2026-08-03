import mongoose, { Schema, Document, Model } from 'mongoose';
import { TRANSLATION_TARGET_LANGS } from '../../../lib/index';

// Durable cache for machine-translated user content (spec/user-content-
// translation-impl.md §2.2). One row per (kind, refId, targetLang), upserted.
// Rows are disposable — dropping the collection only costs money to rebuild.
export type TranslationKind = 'blueprint' | 'comment';
export type TranslationProviderName = 'google-v2' | 'human';

// Runtime enum arrays derived from the unions above so a new kind/provider
// added to the type can't compile while silently failing schema validation.
const TRANSLATION_KINDS: TranslationKind[] = ['blueprint', 'comment'];
const TRANSLATION_PROVIDERS: TranslationProviderName[] = ['google-v2', 'human'];

export interface Translation extends Document {
  kind: TranslationKind;
  refId: mongoose.Types.ObjectId;
  targetLang: string;
  // As detected at translate time (may differ from the source doc's own
  // sourceLang if that was recomputed since)
  sourceLang: string | null;
  // sha256 of the source text (first 16 hex chars) — freshness check, not an
  // invalidation hook. A mismatch on read means "stale", not "broken": the
  // caller re-translates and upserts over the same row.
  sourceHash: string;
  translatedText: string;
  provider: TranslationProviderName;
  charCount: number;
  // Phase 4 (deferred): human-submitted corrections. null = machine.
  reviewedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TranslationModel {
  static model: Model<Translation>;

  public static init() {
    const translationSchema = new mongoose.Schema(
      {
        kind: { type: String, enum: TRANSLATION_KINDS, required: true },
        refId: { type: Schema.Types.ObjectId, required: true },
        targetLang: { type: String, enum: TRANSLATION_TARGET_LANGS, required: true },
        sourceLang: { type: String, default: null },
        sourceHash: { type: String, required: true },
        translatedText: { type: String, required: true },
        provider: { type: String, enum: TRANSLATION_PROVIDERS, required: true },
        charCount: { type: Number, required: true },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      },
      { timestamps: true }
    );

    translationSchema.index({ kind: 1, refId: 1, targetLang: 1 }, { unique: true });

    TranslationModel.model =
      (mongoose.models['Translation'] as Model<Translation>) ??
      mongoose.model<Translation>('Translation', translationSchema);
  }
}
