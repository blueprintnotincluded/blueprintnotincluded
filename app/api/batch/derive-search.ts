// Backfill: derive blueprintsearch rows for all blueprints with the same
// service the save path uses (search-index-service). Needs the game database
// bootstrap (term display names come from OniItem), like derive-rooms.
//
// Usage:
//   ts-node app/api/batch/derive-search.ts [--dry-run] [--limit N]
//
// --limit N reads a random sample of N documents (see batch-sampling.ts).
// Rerunnable/resumable: a row whose sourceHash already matches is only
// signal-refreshed, so re-running after an interruption is cheap.
// In the deploy image run it by task name instead:
//   cd /bpni/build && npm run derive-search

import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import {
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  ImageSource,
  OniItem,
  SpriteInfo,
  SpriteModifier,
} from '../../../lib/index';
import { BlueprintModel } from '../models/blueprint';
import { BlueprintSearchModel } from '../models/blueprint-search';
import { deriveSearchRow } from '../services/search-index-service';
import { parseBatchArgs, sampledCursor, describeScope } from './batch-sampling';

dotenv.config();

const BULK_BATCH_SIZE = 200;

// Same bootstrap as app.ts / derive-rooms: OniItem display names feed terms[].
function loadGameDatabase() {
  const dbPath = path.resolve(__dirname, '../../../assets/database/database-2024.json');
  const json = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  ImageSource.init();
  BuildableElement.init();
  BuildableElement.load(json.elements);
  BuildMenuCategory.init();
  BuildMenuCategory.load(json.buildMenuCategories);
  BuildMenuItem.init();
  BuildMenuItem.load(json.buildMenuItems);
  SpriteInfo.init();
  SpriteInfo.load(json.uiSprites);
  SpriteModifier.init();
  SpriteModifier.load(json.spriteModifiers);
  OniItem.init();
  OniItem.load(json.buildings);
}

async function run(dryRun: boolean, limit: number | null) {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  loadGameDatabase();
  await mongoose.connect(mongoUri);
  BlueprintModel.init();
  BlueprintSearchModel.init();

  console.log(describeScope(limit, dryRun));

  // Existing rows' freshness keys, so unchanged blueprints are one $set of
  // signals, not a full text rewrite (keeps re-runs near no-op).
  const existing = new Map<string, string>();
  for await (const row of BlueprintSearchModel.model
    .find({ lang: 'en' })
    .select('blueprintId sourceHash')
    .cursor()) {
    existing.set(row.blueprintId.toString(), row.sourceHash);
  }

  const cursor = sampledCursor(BlueprintModel.model, {}, limit);
  let processed = 0;
  let created = 0;
  let refreshed = 0;
  let fresh = 0;
  let pending: mongoose.AnyBulkWriteOperation[] = [];

  async function flush() {
    if (pending.length === 0) return;
    // Dry run skips only the write — pending still clears, so memory stays
    // bounded by BULK_BATCH_SIZE either way.
    if (!dryRun) await BlueprintSearchModel.model.bulkWrite(pending as any);
    pending = [];
  }

  for await (const doc of cursor) {
    processed++;
    const fields = deriveSearchRow(doc);
    const key = (doc._id as mongoose.Types.ObjectId).toString();
    const known = existing.get(key);
    if (known == null) created++;
    else if (known !== fields.sourceHash) refreshed++;
    else fresh++;

    // Signals refresh even when the text is fresh — cheap, and it heals any
    // drift from missed fire-and-forget syncs.
    pending.push({
      updateOne: {
        filter: { blueprintId: doc._id as mongoose.Types.ObjectId, lang: fields.lang },
        update: { $set: fields },
        upsert: true,
      },
    });
    if (pending.length >= BULK_BATCH_SIZE) await flush();
    if (processed % 500 === 0) console.log(`  ...${processed} processed`);
  }
  await flush();

  console.log(`\nSearch rows — processed: ${processed}${dryRun ? ' (dry run)' : ''}`);
  console.log(`  new: ${created}, stale (re-derived): ${refreshed}, fresh: ${fresh}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  const { dryRun, limit } = parseBatchArgs(process.argv);
  run(dryRun, limit).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
