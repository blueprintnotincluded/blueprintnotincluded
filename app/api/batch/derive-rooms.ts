// Backfill script: derive the `rooms` field for all non-deleted blueprints
// using the same shared detector as the save path (room-derivation-service).
//
// Usage:
//   ts-node app/api/batch/derive-rooms.ts [--dry-run]
//
// Loads database-2024.json and bootstraps the OniItem statics (same as the
// server startup) because room derivation parses each document's stored data
// into a real Blueprint. Rerunnable: recomputes and $sets `rooms` on every
// document whose value changed; --dry-run only reports counts per room type.
// In the deploy image run the compiled output instead:
//   cd /bpni/build && node app/api/batch/derive-rooms.js [--dry-run]

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
import { deriveRooms } from '../services/room-derivation-service';

dotenv.config();

// Same bootstrap as app.ts: OniItem.load needs the static tables populated.
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

function sameRooms(a: string[] | null | undefined, b: string[] | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

async function run(dryRun: boolean) {
  loadGameDatabase();

  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  BlueprintModel.init();

  const cursor = BlueprintModel.model.find({ deletedAt: null }).cursor();
  let processed = 0;
  let updated = 0;
  let unchanged = 0;
  let nullResults = 0;
  const perType = new Map<string, number>();

  for await (const doc of cursor) {
    processed++;
    const rooms = deriveRooms(doc.data);

    if (rooms == null) nullResults++;
    else for (const tag of rooms) perType.set(tag, (perType.get(tag) ?? 0) + 1);

    if (sameRooms(doc.rooms, rooms)) {
      unchanged++;
      continue;
    }

    updated++;
    if (!dryRun) {
      await BlueprintModel.model.updateOne({ _id: doc._id }, { $set: { rooms } });
    }
  }

  console.log(
    `Processed: ${processed}, updated: ${updated}, unchanged: ${unchanged}, not derivable: ${nullResults}${dryRun ? ' (dry run)' : ''}`
  );
  const typeReport = [...perType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `${tag}: ${count}`)
    .join(', ');
  console.log(`Rooms by type — ${typeReport || 'none detected'}`);
  await mongoose.disconnect();
}

const dryRun = process.argv.includes('--dry-run');
run(dryRun).catch(err => {
  console.error(err);
  process.exit(1);
});
