'use strict';

// Migration 3: likeCount counter-cache for upvotes.
//
// up:   1. Set likeCount = size of the likes array (recomputes from current
//          state, so re-running is safe). Self-likes are kept: every upload
//          seeds likes with the owner, and that stays part of the count.
//       2. Create the "most liked" feed index { deletedAt, likeCount, createdAt }.
//
// down: unset likeCount and drop the index. The likes array is never touched.
//
// Both directions are idempotent — safe to re-run if interrupted.

module.exports = {
  async up(db) {
    const col = db.collection('blueprints');

    await col.updateMany({}, [
      { $set: { likeCount: { $size: { $ifNull: ['$likes', []] } } } },
    ]);

    // Index backing sort({ likeCount: -1, createdAt: -1 }) on the public feed
    await col.createIndex(
      { deletedAt: 1, likeCount: -1, createdAt: -1 },
      { background: true, name: 'deletedAt_1_likeCount_-1_createdAt_-1' }
    );
  },

  async down(db) {
    const col = db.collection('blueprints');

    await col.updateMany({}, { $unset: { likeCount: '' } });

    try {
      await col.dropIndex('deletedAt_1_likeCount_-1_createdAt_-1');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') throw err;
    }
  },
};
