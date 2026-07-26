'use strict';

// Migration: drop the legacy `gameVersion` field.
//
// `gameVersion` (single-valued: base/spacedOut/frostyPlanet/bionicBooster) is
// superseded by `requiredDlcs` (the set of raw Klei DLC ids a blueprint
// needs), which shipped and was backfilled in migration
// 20260725000000_blueprint-required-dlcs.js. Since then gameVersion has been
// read-only/back-compat-only — nothing derives real data from it anymore.
// Safe to $unset directly in one pass rather than a two-migration
// stop-writing-then-unset sequence, because the replacement field was already
// established and verified against prod weeks ago (spec/dlc-resume.md).
//
// up:   drop the three gameVersion indexes (the two discovery-feed compounds
//       plus the single-field index mongoose auto-created from the schema's
//       `index: true`), then $unset the field from every blueprint document.
//
// down: recompute gameVersion from requiredDlcs (same priority rule the old
//       deriveGameVersion used — highest-priority DLC wins, unknown ids
//       ignored) and $set it back, then restore the three indexes. Faithful
//       because requiredDlcs is derived from the same underlying data and is
//       never deleted, so this reproduces the original values exactly rather
//       than merely un-setting.
//
// Both directions are idempotent — createIndex/dropIndex tolerate
// already-applied state, and recomputing gameVersion from requiredDlcs is a
// pure function of stored data.

const GAME_VERSIONS = ['base', 'spacedOut', 'frostyPlanet', 'bionicBooster'];
const DLC_TO_GAME_VERSION = {
  EXPANSION1_ID: 'spacedOut',
  DLC2_ID: 'frostyPlanet',
  DLC5_ID: 'bionicBooster',
};

const OLD_INDEXES = [
  { deletedAt: 1, isPublished: 1, gameVersion: 1, createdAt: -1 },
  { deletedAt: 1, isPublished: 1, gameVersion: 1, category: 1, createdAt: -1 },
  { gameVersion: 1 },
];

function indexName(keys) {
  return Object.entries(keys)
    .map(([field, dir]) => `${field}_${dir}`)
    .join('_');
}

async function dropIfExists(col, name) {
  try {
    await col.dropIndex(name);
  } catch (err) {
    if (err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') throw err;
  }
}

function deriveGameVersion(requiredDlcs) {
  let best = 0;
  for (const dlcId of requiredDlcs || []) {
    const version = DLC_TO_GAME_VERSION[dlcId];
    if (version === undefined) continue;
    const idx = GAME_VERSIONS.indexOf(version);
    if (idx > best) best = idx;
  }
  return GAME_VERSIONS[best];
}

module.exports = {
  async up(db) {
    const blueprints = db.collection('blueprints');

    for (const keys of OLD_INDEXES) {
      await dropIfExists(blueprints, indexName(keys));
    }

    const result = await blueprints.updateMany({}, { $unset: { gameVersion: '' } });
    console.log(`unset gameVersion on ${result.modifiedCount} blueprints`);
  },

  async down(db) {
    const blueprints = db.collection('blueprints');

    const cursor = blueprints.find({}).project({ requiredDlcs: 1 });
    let restored = 0;
    let ops = [];
    for await (const doc of cursor) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { gameVersion: deriveGameVersion(doc.requiredDlcs) } },
        },
      });
      if (ops.length >= 1000) {
        await blueprints.bulkWrite(ops);
        restored += ops.length;
        ops = [];
      }
    }
    if (ops.length > 0) {
      await blueprints.bulkWrite(ops);
      restored += ops.length;
    }
    console.log(`restored gameVersion on ${restored} blueprints`);

    for (const keys of OLD_INDEXES) {
      await blueprints.createIndex(keys, { background: true, name: indexName(keys) });
    }
  },
};
