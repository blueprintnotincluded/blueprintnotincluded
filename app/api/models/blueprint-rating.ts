import mongoose, { Schema, Document, Model } from 'mongoose';

// One document per user+blueprint: the user's current 1–5 star rating.
// The blueprint carries the denormalized aggregate (ratingCount /
// ratingAverage), recomputed out of band from this collection so the
// aggregation algorithm can evolve (plain average today, recency-weighted
// later) without touching clients or this schema.
export interface BlueprintRating extends Document {
  blueprintId: mongoose.Types.ObjectId;
  userId: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

export class BlueprintRatingModel {
  static model: Model<BlueprintRating>;

  public static init() {
    const ratingSchema = new mongoose.Schema({
      blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
      userId: { type: String, required: true },
      value: { type: Number, required: true, min: 1, max: 5 },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });

    // One rating per user per blueprint; also the lookup for "my rating"
    ratingSchema.index({ blueprintId: 1, userId: 1 }, { unique: true });
    // "Rated by X" profile tab, newest first
    ratingSchema.index({ userId: 1, updatedAt: -1 });

    BlueprintRatingModel.model =
      (mongoose.models['BlueprintRating'] as Model<BlueprintRating>) ??
      mongoose.model<BlueprintRating>('BlueprintRating', ratingSchema);
  }
}
