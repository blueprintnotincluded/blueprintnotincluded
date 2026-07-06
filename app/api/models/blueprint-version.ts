import mongoose, { Schema, Document, Model } from 'mongoose';

export interface BlueprintVersion extends Document {
  blueprintId: mongoose.Types.ObjectId;
  // Optional user label: "stable", "v2", "post-optimization"
  name?: string | null;
  data: any;
  thumbnail?: string | null;
  modVersion?: string | null;
  createdAt: Date;
  deletedAt?: Date | null;
}

export class BlueprintVersionModel {
  static model: Model<BlueprintVersion>;

  public static init() {
    const blueprintVersionSchema = new mongoose.Schema({
      blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
      name: { type: String, default: null, maxlength: 60 },
      data: Object,
      thumbnail: String,
      modVersion: String,
      createdAt: { type: Date, default: Date.now },
      deletedAt: { type: Date, default: null },
    });

    // Version history list, newest first
    blueprintVersionSchema.index({ blueprintId: 1, createdAt: -1 });
    // Find current version (latest where deletedAt is null)
    blueprintVersionSchema.index({ blueprintId: 1, deletedAt: 1 });

    BlueprintVersionModel.model =
      (mongoose.models['BlueprintVersion'] as Model<BlueprintVersion>) ??
      mongoose.model<BlueprintVersion>('BlueprintVersion', blueprintVersionSchema);
  }
}
