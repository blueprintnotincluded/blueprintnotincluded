// Backfill script: derive gameVersion and modded for all blueprints in the
// database using the same logic as the save dialog.
//
// Usage:
//   ts-node app/api/batch/derive-blueprint-metadata.ts [--dry-run]
//
// The script loads database-2024.json to build the DLC and known-ID maps,
// then iterates every blueprint document and recomputes gameVersion and modded.
// modded is derived from whether any stored prefabId is absent from the
// current database (approximation — unknown buildings were stripped before
// saving, so true mod detection was only possible at import time).

import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { deriveGameVersion, deriveModded } from '../../../lib/index';
import { BlueprintModel } from '../models/blueprint';
import { MdbBlueprint } from '../../../lib/index';

dotenv.config();

function buildLookups(dbPath: string): {
  dlcIdsMap: Map<string, string[]>;
  knownIds: Set<string>;
} {
  const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const dlcIdsMap = new Map<string, string[]>();
  const knownIds = new Set<string>();

  for (const building of raw.buildings) {
    dlcIdsMap.set(building.prefabId, building.dlcIds ?? []);
    knownIds.add(building.prefabId);
  }

  return { dlcIdsMap, knownIds };
}

async function run(dryRun: boolean) {
  const dbPath = path.resolve(__dirname, '../../../assets/database/database-2024.json');
  const { dlcIdsMap, knownIds } = buildLookups(dbPath);

  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  BlueprintModel.init();

  const cursor = BlueprintModel.model.find({}).cursor();
  let processed = 0;
  let updated = 0;

  for await (const doc of cursor) {
    const mdb = doc.data as MdbBlueprint;
    const prefabIds = (mdb?.blueprintItems ?? []).map((b: any) => String(b.id));

    const buildingDlcIds = prefabIds.map(id => dlcIdsMap.get(id) ?? []);
    const gameVersion = deriveGameVersion(buildingDlcIds);
    // Only trust a positive modded=true: unknown buildings were stripped at import,
    // so false here means "no remaining IDs are unknown" — not "definitely vanilla".
    const derivedModded = deriveModded(prefabIds, knownIds);

    processed++;

    const changed =
      doc.gameVersion !== gameVersion ||
      (derivedModded && doc.modded !== true);

    if (changed) {
      updated++;
      if (!dryRun) {
        const $set: Record<string, unknown> = { gameVersion };
        if (derivedModded) $set.modded = true;
        await BlueprintModel.model.updateOne({ _id: doc._id }, { $set });
      }
    }
  }

  console.log(`Processed: ${processed}, updated: ${updated}${dryRun ? ' (dry run)' : ''}`);
  await mongoose.disconnect();
}

const dryRun = process.argv.includes('--dry-run');
run(dryRun).catch(err => {
  console.error(err);
  process.exit(1);
});
