'use strict';

// Migration 1: replace deleted:Boolean with deletedAt:Date on blueprints.
//
// up:   deleted:true  → deletedAt = modifiedAt
//       deleted:false/missing → deletedAt = null
//       The old `deleted` field is left in place; it orphans once removed from the schema.
//
// down: remove deletedAt from all blueprints.
//       `deleted` was never touched by up, so the boolean is still present and correct.
//
// Both directions are idempotent — safe to re-run if interrupted.

module.exports = {
  async up(db) {
    const col = db.collection('blueprints');

    // deleted:true → deletedAt = modifiedAt (only docs missing deletedAt)
    await col.updateMany(
      { deleted: true, deletedAt: { $exists: false } },
      [{ $set: { deletedAt: '$modifiedAt' } }]
    );

    // deleted:false/null/missing → deletedAt = null (only docs missing deletedAt)
    await col.updateMany(
      { deleted: { $ne: true }, deletedAt: { $exists: false } },
      { $set: { deletedAt: null } }
    );
  },

  async down(db) {
    await db.collection('blueprints').updateMany(
      { deletedAt: { $exists: true } },
      { $unset: { deletedAt: '' } }
    );
  },
};
