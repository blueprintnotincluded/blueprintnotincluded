import mongoose, { Schema, Document, Model } from 'mongoose';

// Durable storage for server-rendered blueprint preview variants
// (spec/social/preview-images-perf-2.md Phase 3). The local disk cache is
// ephemeral (discarded on every redeploy); these rows are the L2 that
// survives. ~200KB x 3 variants per blueprint, included in normal backups.
// Rows for soft-deleted blueprints are left in place — invisible and
// harmless; cleanup can piggyback on whatever purges deleted blueprints.
export interface PreviewImage extends Document {
  blueprintId: mongoose.Types.ObjectId;
  variant: string; // 'card.webp' | 'hero.webp' | 'og.png'
  bytes: Buffer;
  contentType: string;
  renderedAt: Date;
  // The blueprint's modifiedAt at render time: the row is fresh while this
  // is >= the blueprint's current modifiedAt (the Mongo twin of the disk
  // cache's mtime rule). Null when the blueprint has no modifiedAt.
  sourceModifiedAt?: Date | null;
  // The render pipeline version that produced these bytes
  // (PreviewImageService.PREVIEW_RENDER_VERSION). A row whose version doesn't
  // match the running server's is always stale, however fresh sourceModifiedAt
  // looks — this is what forces a one-time re-render after a pipeline change
  // (e.g. the baked-in grid) that existing bytes can't retroactively reflect.
  // Absent on rows written before this field existed, which just never match.
  renderVersion?: number | null;
}

export class PreviewImageModel {
  static model: Model<PreviewImage>;

  public static init() {
    const previewImageSchema = new mongoose.Schema({
      blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
      variant: { type: String, required: true },
      bytes: { type: Buffer, required: true },
      contentType: { type: String, required: true },
      renderedAt: { type: Date, required: true },
      sourceModifiedAt: { type: Date, default: null },
      renderVersion: { type: Number, default: null },
    });

    previewImageSchema.index({ blueprintId: 1, variant: 1 }, { unique: true });

    PreviewImageModel.model =
      (mongoose.models['PreviewImage'] as Model<PreviewImage>) ??
      mongoose.model<PreviewImage>('PreviewImage', previewImageSchema);
  }
}
