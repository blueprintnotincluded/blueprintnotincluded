import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { BlueprintModel } from './models/blueprint';
import {
  PreviewImageService,
  PreviewVariant,
  PREVIEW_VARIANTS,
} from './services/preview-image-service';

// Serves the server-rendered preview derivatives:
//   GET /api/blueprints/:id/preview/card.webp
//   GET /api/blueprints/:id/preview/hero.webp
//   GET /api/blueprints/:id/preview/og.png
// Falls back to the legacy client-generated thumbnail stored on the document
// when rendering is unavailable (disabled, worker failure, empty blueprint).
export class PreviewController {
  constructor() {
    this.getPreview = this.getPreview.bind(this);
  }

  public async getPreview(req: Request, res: Response) {
    const id = req.params.id;
    const variant = req.params.variant as PreviewVariant;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send();
    if (!PREVIEW_VARIANTS.includes(variant)) return res.status(404).send();

    try {
      const blueprint = await BlueprintModel.model
        .findOne({ _id: id, deletedAt: null })
        .select('modifiedAt thumbnail')
        .lean();
      if (!blueprint) return res.status(404).send();

      const modifiedAt = blueprint.modifiedAt ?? null;

      const etag = `"${id}-${modifiedAt ? new Date(modifiedAt).getTime() : 0}-${variant}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).send();

      const result = await PreviewImageService.instance.getVariant(id, modifiedAt, variant, () =>
        BlueprintModel.model
          .findById(id)
          .select('data')
          .lean()
          .then(doc => doc?.data ?? null)
      );

      // Versioned urls (?v=<modifiedAt millis>) are immutable; bare urls
      // stay revalidatable so edits show up promptly through Cloudflare.
      const cacheControl = req.query.v
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300';

      if (result) {
        res.set({ 'Content-Type': result.contentType, 'Cache-Control': cacheControl, ETag: etag });
        return res.send(result.buffer);
      }

      // Legacy fallback: the stored save-time thumbnail (always PNG).
      if (blueprint.thumbnail) {
        const base64 = blueprint.thumbnail.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        res.set({ 'Content-Type': 'image/png', 'Cache-Control': cacheControl, ETag: etag });
        return res.send(Buffer.from(base64, 'base64'));
      }

      return res.status(404).send();
    } catch (err) {
      console.error('Preview serve error', err);
      return res.status(500).send();
    }
  }
}
