import mongoose, { Schema, Document, Model } from 'mongoose';

// One provider call in 2x2 grid mode: the full grid image exactly as Gemini
// returned it, plus the request/response metadata. The four Avatar rows
// produced from it reference this row via batchId — the grid is the paid
// asset kept verbatim, the tiles are derivatives.
export interface AvatarBatch extends Document {
  provider: string;
  providerModel: string;
  promptTemplate: string;
  prompt: string;
  sourceType: string;
  seedUploadId?: mongoose.Types.ObjectId | null;
  // The user whose generate request paid for this call (null for admin/seed
  // batches and refills) — the basis of the one-generation-per-day limit,
  // durable across restarts unlike an in-process cooldown map
  requestedBy?: mongoose.Types.ObjectId | null;

  bytes: Buffer;
  contentType: string;
  width?: number;
  height?: number;
  // sha256 of bytes; unique+sparse so an identical grid dedupes wholesale
  sha256: string;

  interactionId?: string | null;
  usage?: unknown;
  latencyMs?: number;

  createdAt: Date;
  updatedAt: Date;
}

export class AvatarBatchModel {
  static model: Model<AvatarBatch>;

  public static init() {
    const batchSchema = new mongoose.Schema(
      {
        provider: { type: String, required: true, default: 'gemini' },
        providerModel: { type: String, required: true },
        promptTemplate: { type: String, required: true },
        prompt: { type: String, required: true },
        sourceType: { type: String, required: true },
        seedUploadId: { type: Schema.Types.ObjectId, ref: 'AvatarSeedUpload', default: null },
        requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

        bytes: { type: Buffer, required: true },
        contentType: { type: String, required: true },
        width: { type: Number },
        height: { type: Number },
        sha256: { type: String, required: true },

        interactionId: { type: String, default: null },
        usage: { type: Schema.Types.Mixed },
        latencyMs: { type: Number },
      },
      { timestamps: true }
    );

    batchSchema.index({ sha256: 1 }, { unique: true, sparse: true });
    // Rate-limit lookup: latest generation by user
    batchSchema.index({ requestedBy: 1, createdAt: -1 }, { sparse: true });

    AvatarBatchModel.model =
      (mongoose.models['AvatarBatch'] as Model<AvatarBatch>) ??
      mongoose.model<AvatarBatch>('AvatarBatch', batchSchema);
  }
}
