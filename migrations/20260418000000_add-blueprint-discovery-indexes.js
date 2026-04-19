'use strict';

// Add compound indexes on blueprints for the public discovery feed.
// These allow efficient filtering by deletedAt + optional gameVersion/category.
// MongoDB createIndex is idempotent — safe to re-run.

module.exports = {
  async up(db) {
    const col = db.collection('blueprints');
    await col.createIndex({ deletedAt: 1, createdAt: -1 }, { background: true, name: 'deletedAt_1_createdAt_-1' });
    await col.createIndex({ deletedAt: 1, gameVersion: 1, createdAt: -1 }, { background: true, name: 'deletedAt_1_gameVersion_1_createdAt_-1' });
    await col.createIndex({ deletedAt: 1, category: 1, createdAt: -1 }, { background: true, name: 'deletedAt_1_category_1_createdAt_-1' });
    await col.createIndex({ deletedAt: 1, gameVersion: 1, category: 1, createdAt: -1 }, { background: true, name: 'deletedAt_1_gameVersion_1_category_1_createdAt_-1' });
  },

  async down(db) {
    const col = db.collection('blueprints');
    await col.dropIndex('deletedAt_1_createdAt_-1');
    await col.dropIndex('deletedAt_1_gameVersion_1_createdAt_-1');
    await col.dropIndex('deletedAt_1_category_1_createdAt_-1');
    await col.dropIndex('deletedAt_1_gameVersion_1_category_1_createdAt_-1');
  },
};
