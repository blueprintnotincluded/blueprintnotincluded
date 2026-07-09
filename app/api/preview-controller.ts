import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { BlueprintModel } from './models/blueprint';
import { BlueprintVersionModel } from './models/blueprint-version';
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
      if (req.headers['if-none-match'] === etag) {
        res.set({ ETag: etag });
        return res.status(304).end();
      }

      const result = await PreviewImageService.instance.getVariant(id, modifiedAt, variant, () =>
        PreviewController.loadRenderData(id)
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
      console.log('Preview serve error');
      console.log(err);
      return res.status(500).send();
    }
  }

  // What the blueprint currently renders as: the current version's data when
  // one is set (a restore points currentVersionId at an older version without
  // rewriting the Blueprint's cached `data`), else the cached `data` for
  // documents predating versioning — the lean twin of resolveCurrentData.
  private static async loadRenderData(id: string): Promise<unknown | null> {
    const doc = await BlueprintModel.model.findById(id).select('data currentVersionId').lean();
    if (doc == null) return null;
    if (doc.currentVersionId != null) {
      const version = await BlueprintVersionModel.model
        .findById(doc.currentVersionId)
        .select('data')
        .lean();
      if (version?.data != null) return version.data;
    }
    return doc.data ?? null;
  }
}
