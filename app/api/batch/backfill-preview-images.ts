// Backfill script: render preview images for every non-deleted blueprint and
// store them durably in Mongo (spec/social/preview-images-perf-2.md Phase 3).
//
// Usage:
//   ts-node app/api/batch/backfill-preview-images.ts [--dry-run]
//
// Blueprints whose three durable rows are already fresh (sourceModifiedAt >=
// the blueprint's modifiedAt) are skipped, so the run is rerunnable and
// resumable — interrupt it anytime and start again. Renders go through the
// same serialized worker queue as the live server (one at a time); failures
// are logged and counted but never abort the run. --dry-run reports the
// fresh/stale split without rendering or writing anything.
//
// This writes prod data: run it against a local bpni-prod dump first (the
// migration pre-merge process in CLAUDE.md applies in spirit).

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { BlueprintModel } from '../models/blueprint';
import { BlueprintVersionModel } from '../models/blueprint-version';
import { PreviewImageModel } from '../models/preview-image';
import { PreviewImageService, PREVIEW_VARIANTS } from '../services/preview-image-service';
import { PreviewController } from '../preview-controller';

dotenv.config();

async function allRowsFresh(
  blueprintId: mongoose.Types.ObjectId,
  modifiedAt: Date | null | undefined
): Promise<boolean> {
  const rows = await PreviewImageModel.model
    .find({ blueprintId })
    .select('variant sourceModifiedAt')
    .lean();
  const byVariant = new Map(rows.map(row => [row.variant, row.sourceModifiedAt]));
  return PREVIEW_VARIANTS.every(
    variant =>
      byVariant.has(variant) && PreviewImageService.isRowFresh(byVariant.get(variant), modifiedAt)
  );
}

async function run(dryRun: boolean) {
  if (process.env.PREVIEW_RENDER_DISABLED === '1' || process.env.NODE_ENV === 'test') {
    throw new Error('preview rendering is disabled in this environment');
  }
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  BlueprintModel.init();
  BlueprintVersionModel.init();
  PreviewImageModel.init();

  const service = PreviewImageService.instance;
  if (!dryRun) service.warmUp();

  const total = await BlueprintModel.model.countDocuments({ deletedAt: null });
  const cursor = BlueprintModel.model
    .find({ deletedAt: null })
    .select('modifiedAt')
    .sort({ createdAt: 1 })
    .cursor();

  let processed = 0;
  let fresh = 0;
  let rendered = 0;
  let failed = 0;
  const startedAt = Date.now();

  for await (const doc of cursor) {
    processed++;
    const blueprintId = doc._id as mongoose.Types.ObjectId;
    const modifiedAt = doc.modifiedAt ?? null;

    if (await allRowsFresh(blueprintId, modifiedAt)) {
      fresh++;
    } else if (dryRun) {
      rendered++; // counts what a real run would render
    } else {
      try {
        await service.renderAndStore(blueprintId.toString(), modifiedAt, () =>
          PreviewController.loadRenderData(blueprintId.toString())
        );
        rendered++;
      } catch (e) {
        failed++;
        console.log(`backfill render failed for ${blueprintId}:`, e);
      }
    }

    if (processed % 25 === 0 || processed === total) {
      const elapsedS = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `[${processed}/${total}] fresh=${fresh} ${dryRun ? 'stale' : 'rendered'}=${rendered}` +
          ` failed=${failed} elapsed=${elapsedS}s`
      );
    }
  }

  console.log(
    `Done. Processed: ${processed}, fresh (skipped): ${fresh}, ` +
      `${dryRun ? 'would render' : 'rendered'}: ${rendered}, failed: ${failed}` +
      `${dryRun ? ' (dry run — nothing written)' : ''}`
  );

  service.stopWorker();
  await mongoose.disconnect();
  if (failed > 0) process.exitCode = 1;
}

const dryRun = process.argv.includes('--dry-run');
run(dryRun).catch(err => {
  console.error(err);
  process.exit(1);
});
