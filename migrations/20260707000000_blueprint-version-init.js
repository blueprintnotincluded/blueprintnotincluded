'use strict';

// Migration 2: isCopy/copyOf -> forkedFrom; data -> BlueprintVersion (spec/FORKS.md).
//
// Step 2a: for every Blueprint missing currentVersionId, create one BlueprintVersion
//          from its current `data` and point currentVersionId at it. `data` is left in
//          place on Blueprint as a read cache during the transition (removed in a
//          later, separate migration once all read paths go through currentVersionId).
// Step 2b: for every Blueprint with isCopy:true and copyOf set (and no forkedFrom yet),
//          set forkedFrom to the copyOf blueprint's initial version (created in 2a).
//          2a runs to completion for all documents before 2b starts, so every copyOf
//          target already has currentVersionId by the time 2b reads it.
//
// Neither isCopy/copyOf nor data is unset here — that is a separate follow-up
// migration after this code path has soaked in production for one release.
//
// Both directions are idempotent — safe to re-run if interrupted.

module.exports = {
  async up(db) {
    const blueprints = db.collection('blueprints');
    const versions = db.collection('blueprintversions');

    // Step 2a
    const cursor = blueprints.find(
      { currentVersionId: null },
      { projection: { data: 1, thumbnail: 1, createdAt: 1 } }
    );
    while (await cursor.hasNext()) {
      const blueprint = await cursor.next();
      const version = await versions.insertOne({
        blueprintId: blueprint._id,
        name: null,
        data: blueprint.data ?? null,
        thumbnail: blueprint.thumbnail ?? null,
        modVersion: null,
        createdAt: blueprint.createdAt ?? new Date(),
        deletedAt: null,
      });
      await blueprints.updateOne(
        { _id: blueprint._id, currentVersionId: null },
        { $set: { currentVersionId: version.insertedId } }
      );
    }

    // Step 2b
    const copyCursor = blueprints.find(
      { isCopy: true, copyOf: { $exists: true, $ne: null }, forkedFrom: null },
      { projection: { copyOf: 1, createdAt: 1 } }
    );
    while (await copyCursor.hasNext()) {
      const blueprint = await copyCursor.next();
      const parent = await blueprints.findOne(
        { _id: blueprint.copyOf },
        { projection: { currentVersionId: 1 } }
      );
      if (!parent || !parent.currentVersionId) continue;

      await blueprints.updateOne(
        { _id: blueprint._id, forkedFrom: null },
        {
          $set: {
            forkedFrom: {
              blueprintId: blueprint.copyOf,
              versionId: parent.currentVersionId,
              forkedAt: blueprint.createdAt ?? new Date(),
            },
          },
        }
      );
    }

    // Indexes
    await versions.createIndex(
      { blueprintId: 1, createdAt: -1 },
      { name: 'blueprintId_1_createdAt_-1' }
    );
    await versions.createIndex(
      { blueprintId: 1, deletedAt: 1 },
      { name: 'blueprintId_1_deletedAt_1' }
    );
    await blueprints.createIndex({ forkCount: -1 }, { name: 'forkCount_-1' });
  },

  async down(db) {
    const blueprints = db.collection('blueprints');
    await blueprints.updateMany({}, { $unset: { currentVersionId: '', forkedFrom: '' } });
    try {
      await blueprints.dropIndex('forkCount_-1');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') throw err;
    }
    try {
      await db.collection('blueprintversions').drop();
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound') throw err;
    }
  },
};
