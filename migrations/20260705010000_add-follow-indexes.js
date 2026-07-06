'use strict';

// Follow collection indexes. New collection — no data migration needed.
// createIndex is idempotent, safe to re-run.

module.exports = {
  async up(db) {
    const col = db.collection('follows');
    await col.createIndex({ followerId: 1, followeeId: 1 }, { unique: true, name: 'followerId_1_followeeId_1' });
    await col.createIndex({ followeeId: 1 }, { name: 'followeeId_1' });
    await col.createIndex({ followerId: 1, createdAt: -1 }, { name: 'followerId_1_createdAt_-1' });
  },

  async down(db) {
    const col = db.collection('follows');
    const dropIfExists = async (name) => {
      try {
        await col.dropIndex(name);
      } catch (err) {
        if (err.codeName !== 'IndexNotFound') throw err;
      }
    };
    await dropIfExists('followerId_1_followeeId_1');
    await dropIfExists('followeeId_1');
    await dropIfExists('followerId_1_createdAt_-1');
  },
};
