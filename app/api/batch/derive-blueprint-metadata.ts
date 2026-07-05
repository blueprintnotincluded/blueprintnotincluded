// Backfill script: derive gameVersion, modded and category for all blueprints
// in the database using the same logic as the save dialog.
//
// Usage:
//   ts-node app/api/batch/derive-blueprint-metadata.ts [--dry-run]
//
// The script loads database-2024.json to build the DLC, known-ID and category
// maps, then iterates every blueprint document and recomputes gameVersion,
// modded and category. modded is derived from whether any stored prefabId is
// absent from the current database (approximation — unknown buildings were
// stripped before saving, so true mod detection was only possible at import
// time). category is only ever set when currently null — a user's explicit
// choice is never overwritten, so re-running is a no-op for tagged docs.

import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { deriveGameVersion, deriveModded, deriveCategory, buildCategoryLookup, CategoryLookup } from '../../../lib/index';
import { BlueprintModel } from '../models/blueprint';
import { MdbBlueprint } from '../../../lib/index';

dotenv.config();

function buildLookups(dbPath: string): {
  dlcIdsMap: Map<string, string[]>;
  knownIds: Set<string>;
  categoryLookup: CategoryLookup;
} {
  const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const dlcIdsMap = new Map<string, string[]>();
  const knownIds = new Set<string>();

  for (const building of raw.buildings) {
    dlcIdsMap.set(building.prefabId, building.dlcIds ?? []);
    knownIds.add(building.prefabId);
  }

  const categoryLookup = buildCategoryLookup(raw.buildMenuCategories, raw.buildMenuItems);

  return { dlcIdsMap, knownIds, categoryLookup };
}

async function run(dryRun: boolean) {
  const dbPath = path.resolve(__dirname, '../../../assets/database/database-2024.json');
  const { dlcIdsMap, knownIds, categoryLookup } = buildLookups(dbPath);

  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  BlueprintModel.init();

  const cursor = BlueprintModel.model.find({}).cursor();
  let processed = 0;
  let updated = 0;
  let tagged = 0;
  let alreadyTagged = 0;
  let leftUntagged = 0;

  for await (const doc of cursor) {
    const mdb = doc.data as MdbBlueprint;
    const prefabIds = (mdb?.blueprintItems ?? []).map((b: any) => String(b.id));

    const buildingDlcIds = prefabIds.map(id => dlcIdsMap.get(id) ?? []);
    const gameVersion = deriveGameVersion(buildingDlcIds);
    // Only trust a positive modded=true: unknown buildings were stripped at import,
    // so false here means "no remaining IDs are unknown" — not "definitely vanilla".
    const derivedModded = deriveModded(prefabIds, knownIds);

    if (doc.category != null) alreadyTagged++;
    const derivedCategory = doc.category == null ? deriveCategory(prefabIds, categoryLookup) : null;
    if (doc.category == null) {
      if (derivedCategory != null) tagged++;
      else leftUntagged++;
    }

    processed++;

    const changed =
      doc.gameVersion !== gameVersion ||
      (derivedModded && doc.modded !== true) ||
      derivedCategory != null;

    if (changed) {
      updated++;
      if (!dryRun) {
        const $set: Record<string, unknown> = { gameVersion };
        if (derivedModded) $set.modded = true;
        if (derivedCategory != null) $set.category = derivedCategory;
        await BlueprintModel.model.updateOne({ _id: doc._id }, { $set });
      }
    }
  }

  console.log(`Processed: ${processed}, updated: ${updated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Category — tagged: ${tagged}, left untagged: ${leftUntagged}, already set: ${alreadyTagged}`);
  await mongoose.disconnect();
}

const dryRun = process.argv.includes('--dry-run');
run(dryRun).catch(err => {
  console.error(err);
  process.exit(1);
});
