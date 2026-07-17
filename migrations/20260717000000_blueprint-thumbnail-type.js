'use strict';

// Migration 9: thumbnailType discriminator (spec/thumbnail-slim-lists.md).
//
// List responses stop inlining the base64 `thumbnail` blob and send a
// sentinel instead; list queries need to know real-vs-sentinel without
// fetching the blob, so the discriminator is stored per document.
//
// up:   backfill thumbnailType from the existing thumbnail value —
//       the 'svg'/'svg_nothing' sentinels map to themselves, anything else
//       (data URIs, and any junk, which the serve endpoint re-validates) is
//       'real'. Only touches docs without the field, so re-runs and docs
//       written by the new code are untouched.
// down: unset thumbnailType everywhere.
//
// Both directions are idempotent — safe to re-run if interrupted.

module.exports = {
  async up(db) {
    const blueprints = db.collection('blueprints');

    for (const sentinel of ['svg', 'svg_nothing']) {
      await blueprints.updateMany(
        { thumbnailType: { $exists: false }, thumbnail: sentinel },
        { $set: { thumbnailType: sentinel } }
      );
    }
    await blueprints.updateMany(
      { thumbnailType: { $exists: false } },
      { $set: { thumbnailType: 'real' } }
    );
  },

  async down(db) {
    await db.collection('blueprints').updateMany({}, { $unset: { thumbnailType: '' } });
  },
};
