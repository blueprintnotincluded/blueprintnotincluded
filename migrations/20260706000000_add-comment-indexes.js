'use strict';

// Comment collection indexes (spec/COMMENT_SYSTEM.md). New collection — no
// data migration needed. createIndex is idempotent, safe to re-run.

module.exports = {
  async up(db) {
    const col = db.collection('comments');
    // Primary feed: top-level comments by most recent activity
    await col.createIndex(
      { blueprintId: 1, parentId: 1, lastActivityAt: -1 },
      { name: 'blueprintId_1_parentId_1_lastActivityAt_-1' }
    );
    // Reply thread read order
    await col.createIndex(
      { blueprintId: 1, parentId: 1, createdAt: 1 },
      { name: 'blueprintId_1_parentId_1_createdAt_1' }
    );
    // Profile activity + posting-cooldown lookup
    await col.createIndex({ authorId: 1, createdAt: -1 }, { name: 'authorId_1_createdAt_-1' });
  },

  async down(db) {
    const col = db.collection('comments');
    const dropIfExists = async (name) => {
      try {
        await col.dropIndex(name);
      } catch (err) {
        if (err.codeName !== 'IndexNotFound' && err.codeName !== 'NamespaceNotFound') throw err;
      }
    };
    await dropIfExists('blueprintId_1_parentId_1_lastActivityAt_-1');
    await dropIfExists('blueprintId_1_parentId_1_createdAt_1');
    await dropIfExists('authorId_1_createdAt_-1');
  },
};
