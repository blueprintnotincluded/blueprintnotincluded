import mongoose, { Schema, Document, Model } from 'mongoose';

// A user-provided seed/reference photo for avatar generation, kept verbatim so
// a generation can be debugged or re-run without asking the user to re-upload.
// The face classification result is recorded here (not on the avatar) because
// it is a property of the upload, decided once per upload.
export interface AvatarSeedUpload extends Document {
  userId: mongoose.Types.ObjectId;
  bytes: Buffer;
  contentType: string;
  sha256: string;
  width?: number;
  height?: number;
  // null until classified; true routes to the face-seeded prompt
  faceLikely?: boolean | null;
  classifierModel?: string | null;
  classifierOutput?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AvatarSeedUploadModel {
  static model: Model<AvatarSeedUpload>;

  public static init() {
    const seedUploadSchema = new mongoose.Schema(
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        bytes: { type: Buffer, required: true },
        contentType: { type: String, required: true },
        sha256: { type: String, required: true },
        width: { type: Number },
        height: { type: Number },
        faceLikely: { type: Boolean, default: null },
        classifierModel: { type: String, default: null },
        classifierOutput: { type: String, default: null },
      },
      { timestamps: true }
    );

    seedUploadSchema.index({ userId: 1, createdAt: -1 });
    seedUploadSchema.index({ sha256: 1 });

    AvatarSeedUploadModel.model =
      (mongoose.models['AvatarSeedUpload'] as Model<AvatarSeedUpload>) ??
      mongoose.model<AvatarSeedUpload>('AvatarSeedUpload', seedUploadSchema);
  }
}
