'use strict';

// avatarbatches collection index (grid-mode provider outputs). New
// collection — no data migration needed. createIndex is idempotent.

module.exports = {
  async up(db) {
    const col = db.collection('avatarbatches');
    await col.createIndex({ sha256: 1 }, { unique: true, sparse: true, name: 'sha256_1' });
    // Rate-limit lookup: latest generation by user
    await col.createIndex(
      { requestedBy: 1, createdAt: -1 },
      { sparse: true, name: 'requestedBy_1_createdAt_-1' }
    );
  },

  async down(db) {
    const dropIfExists = async (name) => {
      try {
        await db.collection('avatarbatches').dropIndex(name);
      } catch (err) {
        if (err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') throw err;
      }
    };
    await dropIfExists('sha256_1');
    await dropIfExists('requestedBy_1_createdAt_-1');
  },
};
