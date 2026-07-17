'use strict';

// Migration 8: replace likes with per-user star ratings.
//
// up:   1. Seed blueprintratings from existing likes: every NON-AUTHOR like
//          becomes a 5-star rating (a like was an unambiguous positive
//          signal). Author self-likes are skipped — they were a bootstrap
//          hack of the likes system ("every blueprint starts with the
//          author's like"), not real ratings, and the app now forbids
//          self-rating.
//       2. Set the denormalized aggregate (ratingCount / ratingAverage) on
//          every blueprint from what was actually seeded.
//       3. Index blueprintratings: unique {blueprintId, userId} +
//          {userId, updatedAt} for the profile "Rated" tab.
//       4. Swap the discovery sort index: deletedAt/isPublished/likeCount
//          -> deletedAt/isPublished/ratingAverage/ratingCount.
//       The legacy likes/likeCount fields are left in place (dropped from
//       the mongoose schema, so they are orphaned data) — a later cleanup
//       migration can $unset them once the rollout is proven.
//
// down: drop the blueprintratings collection, unset the aggregate fields,
//       restore the likeCount sort index. The orphaned likes/likeCount data
//       was never touched, so down restores exactly the pre-up state.
//
// Both directions are idempotent — safe to re-run if interrupted (rating
// seeds are insert-only upserts keyed on the unique index, so a re-run
// never overwrites a rating a user has since changed; aggregate writes are
// recomputed from the ratings collection each run).

const NEW_SORT_INDEX = {
  deletedAt: 1,
  isPublished: 1,
  ratingAverage: -1,
  ratingCount: -1,
  createdAt: -1,
};
const OLD_SORT_INDEX = { deletedAt: 1, isPublished: 1, likeCount: -1, createdAt: -1 };

function indexName(keys) {
  return Object.entries(keys)
    .map(([field, dir]) => `${field}_${dir}`)
    .join('_');
}

async function dropIndexIfExists(collection, keys) {
  const name = indexName(keys);
  const exists = (await collection.indexes()).some(index => index.name === name);
  if (exists) await collection.dropIndex(name);
}

module.exports = {
  async up(db) {
    const blueprints = db.collection('blueprints');
    const ratings = db.collection('blueprintratings');

    // 3 first: the unique index makes the seeding upserts race-safe
    await ratings.createIndex({ blueprintId: 1, userId: 1 }, { unique: true });
    await ratings.createIndex({ userId: 1, updatedAt: -1 });

    // 1. seed 5-star ratings from non-author likes
    const cursor = blueprints
      .find({ likes: { $exists: true, $ne: [] } })
      .project({ likes: 1, owner: 1, createdAt: 1 });

    let seeded = 0;
    for await (const blueprint of cursor) {
      const ownerId = blueprint.owner != null ? blueprint.owner.toString() : null;
      const raterIds = [...new Set(blueprint.likes.map(String))].filter(id => id !== ownerId);
      if (raterIds.length === 0) continue;

      const now = new Date();
      await ratings.bulkWrite(
        raterIds.map(userId => ({
          updateOne: {
            filter: { blueprintId: blueprint._id, userId },
            // insert-only: a re-run must never overwrite a rating the user
            // has since changed through the app
            update: {
              $setOnInsert: { value: 5, createdAt: now, updatedAt: now },
            },
            upsert: true,
          },
        }))
      );
      seeded += raterIds.length;
    }
    console.log(`seeded ${seeded} ratings from non-author likes`);

    // 2. denormalized aggregates, recomputed from the ratings collection
    const aggregates = await ratings
      .aggregate([
        { $group: { _id: '$blueprintId', count: { $sum: 1 }, average: { $avg: '$value' } } },
      ])
      .toArray();

    await blueprints.updateMany({}, { $set: { ratingCount: 0, ratingAverage: 0 } });
    if (aggregates.length > 0) {
      await blueprints.bulkWrite(
        aggregates.map(aggregate => ({
          updateOne: {
            filter: { _id: aggregate._id },
            update: { $set: { ratingCount: aggregate.count, ratingAverage: aggregate.average } },
          },
        }))
      );
    }
    console.log(`set aggregates on ${aggregates.length} blueprints`);

    // 4. swap the sort index
    await blueprints.createIndex(NEW_SORT_INDEX);
    await dropIndexIfExists(blueprints, OLD_SORT_INDEX);
  },

  async down(db) {
    const blueprints = db.collection('blueprints');

    await db
      .collection('blueprintratings')
      .drop()
      .catch(error => {
        if (error.codeName !== 'NamespaceNotFound') throw error;
      });

    await blueprints.updateMany(
      { $or: [{ ratingCount: { $exists: true } }, { ratingAverage: { $exists: true } }] },
      { $unset: { ratingCount: '', ratingAverage: '' } }
    );

    await blueprints.createIndex(OLD_SORT_INDEX);
    await dropIndexIfExists(blueprints, NEW_SORT_INDEX);
  },
};
