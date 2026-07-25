'use strict';

// Migration: indexes for `requiredDlcs` — the unordered set of raw Klei DLC ids
// a blueprint's buildings require, which supersedes the single-valued
// `gameVersion` (spec/dlc-requirements-plan.md).
//
// up:   create the multikey index on requiredDlcs (membership queries —
//       "show me Bionic Booster blueprints") plus compound equivalents of the
//       existing gameVersion discovery indexes, so the feed can filter on DLC
//       the same way it filters on gameVersion. A compound index may contain
//       only one array field; category/createdAt/deletedAt/isPublished are all
//       scalars, so both compounds are legal.
//
// down: drop exactly those three indexes.
//
// No data backfill on purpose: blueprints written before the field exists have
// no requiredDlcs at all and read as base-game until `npm run derive-metadata`
// next runs. Every new save derives it, so there is nothing to gate on here.
//
// Both directions are idempotent — createIndex is a no-op for an existing
// identical index, and dropIndex tolerates a missing one.

const INDEXES = [
  { requiredDlcs: 1 },
  { deletedAt: 1, isPublished: 1, requiredDlcs: 1, createdAt: -1 },
  { deletedAt: 1, isPublished: 1, requiredDlcs: 1, category: 1, createdAt: -1 },
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

module.exports = {
  async up(db) {
    const blueprints = db.collection('blueprints');
    for (const keys of INDEXES) {
      await blueprints.createIndex(keys, { background: true, name: indexName(keys) });
    }
  },

  async down(db) {
    const blueprints = db.collection('blueprints');
    for (const keys of INDEXES) {
      await dropIfExists(blueprints, indexName(keys));
    }
  },
};
