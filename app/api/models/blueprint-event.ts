import mongoose, { Schema, Document, Model } from 'mongoose';

export const EVENT_TYPES = ['created', 'updated', 'published', 'unpublished', 'deleted'] as const;
export type BlueprintEventType = (typeof EVENT_TYPES)[number];

export interface BlueprintEvent extends Document {
  blueprintId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  type: BlueprintEventType;
  createdAt: Date;
}

export class BlueprintEventModel {
  static model: Model<BlueprintEvent>;

  public static init() {
    const blueprintEventSchema = new mongoose.Schema({
      blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
      actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      type: {
        type: String,
        enum: EVENT_TYPES,
        required: true,
      },
      createdAt: { type: Date, default: Date.now },
    });

    // Per-blueprint lifecycle replay, oldest first (draft-duration math)
    blueprintEventSchema.index({ blueprintId: 1, createdAt: 1 });
    // Cohort research: all events of a type over time
    blueprintEventSchema.index({ type: 1, createdAt: -1 });

    BlueprintEventModel.model =
      (mongoose.models['BlueprintEvent'] as Model<BlueprintEvent>) ??
      mongoose.model<BlueprintEvent>('BlueprintEvent', blueprintEventSchema);
  }
}
