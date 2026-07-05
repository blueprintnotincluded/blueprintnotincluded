'use strict';

// Migration 3: upvotes (likes v2).
//
// up:   1. Strip the automatic owner self-like from every blueprint's likes array.
//          `likes` holds user-id *strings* while `owner` is an ObjectId — compare via $toString.
//       2. Set likeCount = size of the (now-cleaned) likes array.
//       3. Create the "most liked" feed index { deletedAt, likeCount, createdAt }.
//       Both updates recompute from current state, so re-running is safe.
//
// down: re-add the owner to likes via $setUnion (documented approximation: pre-migration
//       every upload self-liked, so this restores the original state for all docs),
//       unset likeCount, drop the index.
//
// Both directions are idempotent — safe to re-run if interrupted.

module.exports = {
  async up(db) {
    const col = db.collection('blueprints');

    // 1. Strip owner self-like
    await col.updateMany({}, [
      {
        $set: {
          likes: {
            $filter: {
              input: { $ifNull: ['$likes', []] },
              cond: { $ne: ['$$this', { $toString: '$owner' }] },
            },
          },
        },
      },
    ]);

    // 2. Counter-cache for the "most liked" sort
    await col.updateMany({}, [
      { $set: { likeCount: { $size: { $ifNull: ['$likes', []] } } } },
    ]);

    // 3. Index backing sort({ likeCount: -1, createdAt: -1 }) on the public feed
    await col.createIndex(
      { deletedAt: 1, likeCount: -1, createdAt: -1 },
      { background: true, name: 'deletedAt_1_likeCount_-1_createdAt_-1' }
    );
  },

  async down(db) {
    const col = db.collection('blueprints');

    await col.updateMany({}, [
      {
        $set: {
          likes: {
            $setUnion: [{ $ifNull: ['$likes', []] }, [{ $toString: '$owner' }]],
          },
        },
      },
      { $unset: 'likeCount' },
    ]);

    try {
      await col.dropIndex('deletedAt_1_likeCount_-1_createdAt_-1');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') throw err;
    }
  },
};
