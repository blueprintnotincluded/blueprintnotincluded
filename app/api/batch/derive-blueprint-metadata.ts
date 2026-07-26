// Backfill script: derive requiredDlcs, modded and category for
// all blueprints in the database using the same logic as the save dialog.
//
// Usage:
//   ts-node app/api/batch/derive-blueprint-metadata.ts [--dry-run] [--recategorize] [--limit N]
//
// --limit N reads a random sample of N documents instead of the whole
// collection (see batch-sampling.ts). A full pass loads every stored blueprint
// blob and takes ~10 minutes on the live corpus; the diagnostic reports below
// are just as readable from 100 sampled documents.
//
// The script loads database-2024.json to build the DLC, known-ID and category
// maps, then iterates every blueprint document and recomputes requiredDlcs,
// modded and category. requiredDlcs is the set of DLCs the
// blueprint's buildings need; blueprints saved before it existed have no value
// at all (they read as base-game) until this script runs. modded is derived from whether any stored prefabId is
// absent from the current database (approximation — unknown buildings were
// stripped before saving, so true mod detection was only possible at import
// time). category is only ever set when currently null — a user's explicit
// choice is never overwritten, so re-running is a no-op for tagged docs.
//
// --recategorize opts out of that rule and re-derives category for EVERY
// document, overwriting whatever is stored. Stored categories are a mix of
// user picks and earlier auto-derivations with no flag distinguishing them, so
// this is destructive to user choices by definition — it exists because a
// change to the scoring rules (see MAX_FALLBACK_SCORE in blueprint-analyzer)
// otherwise can never reach the documents it was written to fix. Dry-run it
// first; it reports the full from -> to migration table.
//
// Both modes also report the prefab ids found in blueprints but absent from
// database-2024.json. Those ids are the unknown-building leg of deriveModded
// AND they contribute no dlcIds, so every one of them is a blueprint silently
// reading as base-game. A long tail here means requiredDlcs is understated.

import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { deriveRequiredDlcs, deriveModded, deriveBlueprintMods, deriveCategory, buildCategoryLookup, CategoryLookup } from '../../../lib/index';
import { BlueprintModel } from '../models/blueprint';
import { MdbBlueprint } from '../../../lib/index';
import { parseBatchArgs, sampledCursor, describeScope } from './batch-sampling';

dotenv.config();

// Enough to see the shape of the tail without scrolling a console session off
// screen; the total distinct count is always printed alongside.
const UNKNOWN_ID_REPORT_LIMIT = 30;

function buildLookups(dbPath: string): {
  dlcIdsMap: Map<string, string[]>;
  knownIds: Set<string>;
  modByPrefabId: Map<string, string>;
  categoryLookup: CategoryLookup;
} {
  const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const dlcIdsMap = new Map<string, string[]>();
  const knownIds = new Set<string>();
  const modByPrefabId = new Map<string, string>();

  for (const building of raw.buildings) {
    dlcIdsMap.set(building.prefabId, building.dlcIds ?? []);
    knownIds.add(building.prefabId);
    if (building.mod) modByPrefabId.set(building.prefabId, building.mod);
  }

  const categoryLookup = buildCategoryLookup(raw.buildMenuCategories, raw.buildMenuItems);

  return { dlcIdsMap, knownIds, modByPrefabId, categoryLookup };
}

async function run(dryRun: boolean, recategorize: boolean, limit: number | null) {
  const dbPath = path.resolve(__dirname, '../../../assets/database/database-2024.json');
  const { dlcIdsMap, knownIds, modByPrefabId, categoryLookup } = buildLookups(dbPath);

  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  BlueprintModel.init();

  const cursor = sampledCursor(BlueprintModel.model, {}, limit);
  let processed = 0;
  let updated = 0;
  let tagged = 0;
  let alreadyTagged = 0;
  let leftUntagged = 0;
  let blueprintsWithMods = 0;
  const distinctMods = new Set<string>();
  let blueprintsWithDlcs = 0;
  const distinctDlcs = new Set<string>();
  // Unknown prefab ids, counted by how many blueprints contain each (not by
  // occurrences — one blueprint placing 200 of a retired tile is one affected
  // document, and it's documents that get mislabelled).
  const unknownIdDocCounts = new Map<string, number>();
  let blueprintsWithUnknownIds = 0;
  // from -> to counts for --recategorize, keyed 'oldCategory -> newCategory'.
  const recategorized = new Map<string, number>();

  for await (const doc of cursor) {
    const mdb = doc.data as MdbBlueprint;
    const prefabIds = (mdb?.blueprintItems ?? []).map((b: any) => String(b.id));

    const unknownInDoc = new Set(prefabIds.filter(id => !knownIds.has(id)));
    if (unknownInDoc.size > 0) blueprintsWithUnknownIds++;
    for (const id of unknownInDoc) {
      unknownIdDocCounts.set(id, (unknownIdDocCounts.get(id) ?? 0) + 1);
    }

    const buildingDlcIds = prefabIds.map(id => dlcIdsMap.get(id) ?? []);
    const requiredDlcs = deriveRequiredDlcs(buildingDlcIds);
    // Only trust a positive modded=true: unknown buildings were stripped at import,
    // so false here means "no remaining IDs are unknown" — not "definitely vanilla".
    const derivedModded = deriveModded(prefabIds, knownIds, modByPrefabId);
    const derivedMods = deriveBlueprintMods(prefabIds, modByPrefabId);

    if (doc.category != null) alreadyTagged++;
    const shouldDerive = recategorize || doc.category == null;
    const derivedCategory = shouldDerive ? deriveCategory(prefabIds, categoryLookup) : null;
    if (doc.category == null) {
      if (derivedCategory != null) tagged++;
      else leftUntagged++;
    } else if (recategorize && derivedCategory !== doc.category) {
      const key = `${doc.category} -> ${derivedCategory ?? 'untagged'}`;
      recategorized.set(key, (recategorized.get(key) ?? 0) + 1);
    }

    processed++;

    // Under --recategorize a doc whose derived category is now null must lose
    // its stored one, so "changed" can't just test derivedCategory != null.
    const categoryChanged = shouldDerive && derivedCategory !== (doc.category ?? null);

    const changed =
      JSON.stringify(doc.requiredDlcs ?? null) !== JSON.stringify(requiredDlcs) ||
      (derivedModded && doc.modded !== true) ||
      JSON.stringify(doc.mods ?? null) !== JSON.stringify(derivedMods) ||
      categoryChanged;

    if (changed) {
      updated++;
      if (!dryRun) {
        const $set: Record<string, unknown> = { requiredDlcs, mods: derivedMods };
        if (derivedModded) $set.modded = true;
        if (categoryChanged && derivedCategory != null) $set.category = derivedCategory;
        const update: Record<string, unknown> = { $set };
        if (categoryChanged && derivedCategory == null) update.$unset = { category: '' };
        await BlueprintModel.model.updateOne({ _id: doc._id }, update);
      }
    }

    if (derivedMods.length > 0) {
      blueprintsWithMods++;
      for (const mod of derivedMods) distinctMods.add(mod);
    }

    if (requiredDlcs.length > 0) {
      blueprintsWithDlcs++;
      for (const dlcId of requiredDlcs) distinctDlcs.add(dlcId);
    }
  }

  console.log(describeScope(limit, dryRun));
  console.log(`Processed: ${processed}, updated: ${updated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Category — tagged: ${tagged}, left untagged: ${leftUntagged}, already set: ${alreadyTagged}`);
  console.log(`mods tagged: ${blueprintsWithMods} blueprints reference ${distinctMods.size} distinct mods`);
  console.log(
    `requiredDlcs: ${blueprintsWithDlcs} blueprints need at least one DLC (${[...distinctDlcs].sort().join(', ') || 'none'})`
  );

  if (recategorize && recategorized.size > 0) {
    console.log('\nRecategorized (previously tagged documents only):');
    for (const [move, count] of [...recategorized.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(6)}  ${move}`);
    }
  }

  console.log(
    `\nUnknown prefab ids: ${unknownIdDocCounts.size} distinct, affecting ${blueprintsWithUnknownIds} blueprints` +
      ` (${((blueprintsWithUnknownIds / Math.max(processed, 1)) * 100).toFixed(1)}% of ${processed})`
  );
  if (unknownIdDocCounts.size > 0) {
    // Each of these both forces modded=true and contributes no dlcIds, so the
    // blueprint reads as base-game regardless of what the building needs.
    const ranked = [...unknownIdDocCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [id, count] of ranked.slice(0, UNKNOWN_ID_REPORT_LIMIT)) {
      console.log(`  ${count.toString().padStart(6)}  ${id}`);
    }
    if (ranked.length > UNKNOWN_ID_REPORT_LIMIT) {
      console.log(`  ... and ${ranked.length - UNKNOWN_ID_REPORT_LIMIT} more`);
    }
  }

  await mongoose.disconnect();
}

const { dryRun, limit } = parseBatchArgs(process.argv);
const recategorize = process.argv.includes('--recategorize');
run(dryRun, recategorize, limit).catch(err => {
  console.error(err);
  process.exit(1);
});
