'use strict';

// Migration 5: draft blueprints — isPublished flag + lifecycle event log.
//
// up:   1. Backfill isPublished: true on every blueprint. Everything that
//          exists today is already public; only new uploads start as drafts.
//          No synthetic historical events are written — research data starts
//          at feature launch.
//       2. Create the six discovery indexes with isPublished inserted after
//          deletedAt, then drop the superseded deletedAt-only versions.
//       3. Create the blueprintevents indexes (implicitly creates the
//          collection).
//
// down: unset isPublished, restore the old discovery indexes, drop the new
//       ones and the blueprintevents indexes. The blueprintevents COLLECTION
//       and its data are left in place on purpose — it is research data and
//       must survive a rollback.
//
// Both directions are idempotent — safe to re-run if interrupted.

const NEW_INDEXES = [
  [{ deletedAt: 1, isPublished: 1, createdAt: -1 }],
  [{ deletedAt: 1, isPublished: 1, gameVersion: 1, createdAt: -1 }],
  [{ deletedAt: 1, isPublished: 1, category: 1, createdAt: -1 }],
  [{ deletedAt: 1, isPublished: 1, gameVersion: 1, category: 1, createdAt: -1 }],
  [{ deletedAt: 1, isPublished: 1, likeCount: -1, createdAt: -1 }],
  [{ deletedAt: 1, isPublished: 1, forkCount: -1, createdAt: -1 }],
];

const OLD_INDEXES = [
  [{ deletedAt: 1, createdAt: -1 }],
  [{ deletedAt: 1, gameVersion: 1, createdAt: -1 }],
  [{ deletedAt: 1, category: 1, createdAt: -1 }],
  [{ deletedAt: 1, gameVersion: 1, category: 1, createdAt: -1 }],
  [{ deletedAt: 1, likeCount: -1, createdAt: -1 }],
  [{ deletedAt: 1, forkCount: -1, createdAt: -1 }],
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

    await blueprints.updateMany({}, { $set: { isPublished: true } });

    for (const [keys] of NEW_INDEXES) {
      await blueprints.createIndex(keys, { background: true, name: indexName(keys) });
    }
    for (const [keys] of OLD_INDEXES) {
      await dropIfExists(blueprints, indexName(keys));
    }

    const events = db.collection('blueprintevents');
    await events.createIndex(
      { blueprintId: 1, createdAt: 1 },
      { background: true, name: 'blueprintId_1_createdAt_1' }
    );
    await events.createIndex(
      { type: 1, createdAt: -1 },
      { background: true, name: 'type_1_createdAt_-1' }
    );
  },

  async down(db) {
    const blueprints = db.collection('blueprints');

    await blueprints.updateMany({}, { $unset: { isPublished: '' } });

    for (const [keys] of OLD_INDEXES) {
      await blueprints.createIndex(keys, { background: true, name: indexName(keys) });
    }
    for (const [keys] of NEW_INDEXES) {
      await dropIfExists(blueprints, indexName(keys));
    }

    // Keep the blueprintevents collection/data (research data); drop only the
    // indexes this migration created.
    const events = db.collection('blueprintevents');
    await dropIfExists(events, 'blueprintId_1_createdAt_1');
    await dropIfExists(events, 'type_1_createdAt_-1');
  },
};
