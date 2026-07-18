import mongoose, { Schema, Document, Model } from 'mongoose';

// One generated avatar asset (spec/social/avatars-identity.md, Gemini variant).
// Every provider call that produces (or fails to produce) an image gets a row:
// generated images are paid assets and are never discarded, and failed rows
// double as the generation-job log for cost/debugging. Binary storage in Mongo
// follows the previewimages precedent — ~0.5MB/doc (512px original + 256px
// display derivative), included in normal backups.
export type AvatarSourceType = 'random' | 'user-upload' | 'seed-batch';
export type AvatarStatus = 'ready' | 'failed';

export interface Avatar extends Document {
  provider: string; // 'gemini'
  // 'model' would shadow Document.model(), hence the prefix
  providerModel: string;
  promptTemplate: string; // template id from avatar-prompts.ts
  prompt: string; // full prompt text as sent
  sourceType: AvatarSourceType;
  seedUploadId?: mongoose.Types.ObjectId | null;

  status: AvatarStatus;
  error?: string | null;

  // Display asset served by /api/users/:username/avatar (256x256)
  bytes?: Buffer;
  contentType?: string;
  width?: number;
  height?: number;
  // Provider output kept verbatim — the paid asset
  originalBytes?: Buffer;
  originalContentType?: string;
  originalWidth?: number;
  originalHeight?: number;
  // sha256 of originalBytes; unique+sparse so identical provider outputs
  // dedupe instead of storing twice
  sha256?: string;

  // Pool state: null means "unused, claimable". Claims go through an atomic
  // findOneAndUpdate on { _id, assignedTo: null } so two users can never
  // receive the same avatar.
  assignedTo?: mongoose.Types.ObjectId | null;
  assignedAt?: Date | null;

  // Provider request/response metadata for debugging and cost tracking
  interactionId?: string | null;
  usage?: unknown;
  latencyMs?: number;

  createdAt: Date;
  updatedAt: Date;
}

export class AvatarModel {
  static model: Model<Avatar>;

  public static init() {
    const avatarSchema = new mongoose.Schema(
      {
        provider: { type: String, required: true, default: 'gemini' },
        providerModel: { type: String, required: true },
        promptTemplate: { type: String, required: true },
        prompt: { type: String, required: true },
        sourceType: { type: String, enum: ['random', 'user-upload', 'seed-batch'], required: true },
        seedUploadId: { type: Schema.Types.ObjectId, ref: 'AvatarSeedUpload', default: null },

        status: { type: String, enum: ['ready', 'failed'], required: true },
        error: { type: String, default: null },

        bytes: { type: Buffer },
        contentType: { type: String },
        width: { type: Number },
        height: { type: Number },
        originalBytes: { type: Buffer },
        originalContentType: { type: String },
        originalWidth: { type: Number },
        originalHeight: { type: Number },
        sha256: { type: String },

        assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        assignedAt: { type: Date, default: null },

        interactionId: { type: String, default: null },
        usage: { type: Schema.Types.Mixed },
        latencyMs: { type: Number },
      },
      { timestamps: true }
    );

    // Pool queries: count/claim unused ready avatars
    avatarSchema.index({ status: 1, assignedTo: 1 });
    avatarSchema.index({ sha256: 1 }, { unique: true, sparse: true });

    AvatarModel.model =
      (mongoose.models['Avatar'] as Model<Avatar>) ?? mongoose.model<Avatar>('Avatar', avatarSchema);
  }
}
