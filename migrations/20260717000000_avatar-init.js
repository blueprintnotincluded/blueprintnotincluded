'use strict';

// Avatar pool + seed-upload collection indexes. New collections — no data
// migration needed (users.avatarId defaults via the Mongoose schema).
// createIndex is idempotent, safe to re-run.

module.exports = {
  async up(db) {
    const avatars = db.collection('avatars');
    await avatars.createIndex({ status: 1, assignedTo: 1 }, { name: 'status_1_assignedTo_1' });
    await avatars.createIndex({ sha256: 1 }, { unique: true, sparse: true, name: 'sha256_1' });

    const seeds = db.collection('avatarseeduploads');
    await seeds.createIndex({ userId: 1, createdAt: -1 }, { name: 'userId_1_createdAt_-1' });
    await seeds.createIndex({ sha256: 1 }, { name: 'sha256_1' });
  },

  async down(db) {
    const dropIfExists = async (col, name) => {
      try {
        await db.collection(col).dropIndex(name);
      } catch (err) {
        if (err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') throw err;
      }
    };
    await dropIfExists('avatars', 'status_1_assignedTo_1');
    await dropIfExists('avatars', 'sha256_1');
    await dropIfExists('avatarseeduploads', 'userId_1_createdAt_-1');
    await dropIfExists('avatarseeduploads', 'sha256_1');
  },
};
