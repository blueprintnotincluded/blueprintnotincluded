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
    });

    // Whole-site monthly row: { month, userId: null }
    schema.index({ month: 1, userId: 1 }, { unique: true });
    // Per-user daily cap lookup
    schema.index({ userId: 1, day: 1 });

    TranslationBudgetModel.model =
      (mongoose.models['TranslationBudget'] as Model<TranslationBudget>) ??
      mongoose.model<TranslationBudget>('TranslationBudget', schema);
  }
}
