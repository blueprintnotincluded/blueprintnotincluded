'use strict';
module.exports = {
  async up(db) {
    await db.collection('blueprints').updateMany(
      { multiplayerSafe: { $exists: true } },
      { $unset: { multiplayerSafe: '' } }
    );
  },
  async down(db) {
    // Field is gone; restoring it would require a backup. No-op is safe.
  },
};
