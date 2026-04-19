/**
 * Validates the shape of the Blueprint collection and reports field presence,
 * value distributions, and any unexpected fields not known to the model.
 *
 * Run locally:
 *   DB_URI=mongodb://localhost:27017/bpni npx ts-node scripts/migration/validate-data-shape.ts
 *
 * Run on prod (from DO app console — DB_URI already in environment):
 *   npx ts-node scripts/migration/validate-data-shape.ts
 *
 * Compare the two outputs. Differences indicate seeds have drifted from prod.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.DB_URI as string;
if (!uri) {
  console.error('DB_URI not set');
  process.exit(1);
}

// Fields the model currently declares — update this list when the schema changes.
const KNOWN_FIELDS = new Set([
  '_id', '__v',
  'owner', 'name', 'tags', 'likes',
  'createdAt', 'modifiedAt', 'thumbnail',
  'isCopy', 'copyOf',
  'data',
  'deleted',      // old field — present before Migration 1
  'deletedAt',    // new field — present after Migration 1
  'gameVersion',  // discovery feed field
  'category',     // discovery feed field
]);

async function run() {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('blueprints');

  const total = await col.countDocuments({});
  console.log(`\n=== Blueprint collection: ${total} documents ===\n`);

  // --- Deletion field presence ---
  const deletedTrue   = await col.countDocuments({ deleted: true });
  const deletedFalse  = await col.countDocuments({ deleted: false });
  const deletedMissing = await col.countDocuments({ deleted: { $exists: false } });
  const deletedAtSet  = await col.countDocuments({ deletedAt: { $ne: null, $exists: true } });
  const deletedAtNull = await col.countDocuments({ deletedAt: null, $or: [{ deletedAt: { $exists: true } }] });
  const deletedAtMissing = await col.countDocuments({ deletedAt: { $exists: false } });

  console.log('Deletion fields:');
  console.log(`  deleted: true          ${deletedTrue}`);
  console.log(`  deleted: false         ${deletedFalse}`);
  console.log(`  deleted: missing       ${deletedMissing}`);
  console.log(`  deletedAt: set (Date)  ${deletedAtSet}`);
  console.log(`  deletedAt: null        ${deletedAtNull}`);
  console.log(`  deletedAt: missing     ${deletedAtMissing}`);

  // --- Fork / copy fields ---
  const isCopyTrue    = await col.countDocuments({ isCopy: true });
  const copyOfSet     = await col.countDocuments({ copyOf: { $exists: true, $ne: null } });

  console.log('\nFork fields:');
  console.log(`  isCopy: true           ${isCopyTrue}`);
  console.log(`  copyOf: set            ${copyOfSet}`);

  // --- Optional future fields (additive, should all be 0 until added) ---
  const hasDescription  = await col.countDocuments({ description: { $exists: true } });
  const hasGameVersion  = await col.countDocuments({ gameVersion: { $exists: true } });
  const hasCategory     = await col.countDocuments({ category: { $exists: true } });

  console.log('\nAdditive fields (expected 0 until migrated):');
  console.log(`  description            ${hasDescription}`);
  console.log(`  gameVersion            ${hasGameVersion}`);
  console.log(`  category               ${hasCategory}`);

  // --- Unknown fields (schema drift detector) ---
  const sample = await col.find({}).limit(500).toArray();
  const unknownFields = new Set<string>();
  for (const doc of sample) {
    for (const key of Object.keys(doc)) {
      if (!KNOWN_FIELDS.has(key)) unknownFields.add(key);
    }
  }

  console.log('\nUnknown fields in first 500 docs (schema drift):');
  if (unknownFields.size === 0) {
    console.log('  none');
  } else {
    for (const f of unknownFields) console.log(`  ⚠ ${f}`);
  }

  // --- Summary line for quick diffing ---
  console.log('\nSummary (copy this line when comparing local vs prod):');
  console.log(JSON.stringify({
    total,
    deletedTrue, deletedFalse, deletedMissing,
    deletedAtSet, deletedAtNull, deletedAtMissing,
    isCopyTrue, copyOfSet,
    unknownFields: [...unknownFields].sort(),
  }, null, 2));

  // --- Post-migration assertion mode ---
  // Run with --assert-post-migration to fail the process if counts violate
  // expected post-migration invariants (all docs have deletedAt, counts mirror deleted).
  if (process.argv.includes('--assert-post-migration')) {
    const failures: string[] = [];

    if (deletedAtMissing !== 0)
      failures.push(`deletedAtMissing=${deletedAtMissing} (expected 0 — all docs must have deletedAt after migration)`);
    if (deletedAtSet !== deletedTrue)
      failures.push(`deletedAtSet=${deletedAtSet} !== deletedTrue=${deletedTrue} (must mirror exactly)`);
    if (deletedAtNull !== deletedFalse + deletedMissing)
      failures.push(`deletedAtNull=${deletedAtNull} !== deletedFalse+deletedMissing=${deletedFalse + deletedMissing} (must mirror exactly)`);
    if (unknownFields.size !== 0)
      failures.push(`unknown fields present: ${[...unknownFields].sort().join(', ')}`);

    if (failures.length > 0) {
      console.error('\n✗ Post-migration assertion FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log('\n✓ Post-migration assertions passed');
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
