import mongoose, { Schema, Document, Model } from 'mongoose';

// Character-spend accounting for the translation feature (spec/user-content-
// translation-impl.md §5). Two row shapes share one collection, distinguished
// by whether `userId` is set:
//   { month, userId: null }  — the whole-site monthly budget
//   { month, userId }        — one user's per-day usage counter (`day` set)
// Incremented with $inc in the same code path that calls the provider, after
// a successful call. A racy over-count of a few thousand chars is fine — the
// budget has 20% headroom built in.
export interface TranslationBudget extends Document {
  month: string; // 'YYYY-MM'
  day?: string | null; // 'YYYY-MM-DD', set only on per-user rows
  userId?: mongoose.Types.ObjectId | null;
  charCount: number;
  requestCount: number;
  geminiReservedMicroUsd: number;
  geminiObservedMicroUsd: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
  geminiRequestCount: number;
}

export class TranslationBudgetModel {
  static model: Model<TranslationBudget>;

  public static init() {
    const schema = new mongoose.Schema({
      month: { type: String, required: true },
      day: { type: String, default: null },
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      charCount: { type: Number, default: 0 },
      requestCount: { type: Number, default: 0 },
      geminiReservedMicroUsd: { type: Number, default: 0 },
      geminiObservedMicroUsd: { type: Number, default: 0 },
      geminiInputTokens: { type: Number, default: 0 },
      geminiOutputTokens: { type: Number, default: 0 },
      geminiRequestCount: { type: Number, default: 0 },
    });

    // Site row: { month, userId: null, day: null }; per-user row: { month,
    // userId, day }. `day` must be in the unique key — {month, userId} alone
    // collides a user's second day of a month against their first (E11000)
    // and also serves the per-user daily cap lookup, so the separate
    // {userId, day} index this replaced was redundant.
    schema.index({ month: 1, userId: 1, day: 1 }, { unique: true });

    TranslationBudgetModel.model =
      (mongoose.models['TranslationBudget'] as Model<TranslationBudget>) ??
      mongoose.model<TranslationBudget>('TranslationBudget', schema);
  }
}
