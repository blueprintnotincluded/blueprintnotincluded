'use strict';

// avatarbatches collection index (grid-mode provider outputs). New
// collection — no data migration needed. createIndex is idempotent.

module.exports = {
  async up(db) {
    await db
      .collection('avatarbatches')
      .createIndex({ sha256: 1 }, { unique: true, sparse: true, name: 'sha256_1' });
  },

  async down(db) {
    try {
      await db.collection('avatarbatches').dropIndex('sha256_1');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') throw err;
    }
  },
};
