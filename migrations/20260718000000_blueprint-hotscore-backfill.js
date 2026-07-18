'use strict';

// Materialize the trending "hot score" on every blueprint + add its index.
//
// Trending switched from a per-request full-collection aggregation to a stored,
// indexed `hotScore` (spec/trending-hotscore-plan.md). The app recomputes
// hotScore on every engagement write (ratings, download flush) and at creation;
// this migration seeds the value for all pre-existing documents and creates the
// index the trending sort uses.
//
// up:   createIndex {deletedAt, isPublished, hotScore:-1, createdAt:-1}, then
//       compute hotScore for every doc with a real createdAt in one server-side
//       aggregation-pipeline updateMany. Deterministic → safe to re-run; it
//       overwrites hotScore each run, which is intended (re-materialize).
// down: drop the index and unset hotScore everywhere.
//
// The formula below is a FROZEN snapshot of lib computeHotScore / HOT_SCORE
// (PRIOR_MEAN 3.5, SHRINK_VOTES 3, W_RATING 1, W_DOWNLOAD 0.5, W_RECENCY 0.18).
// The running app is the live source of truth; if the constants change, author
// a new backfill migration rather than editing this one.

const INDEX_NAME = 'deletedAt_1_isPublished_1_hotScore_-1_createdAt_-1';

// Aggregation-expression form of computeHotScore, keyed on the doc's own fields.
const HOT_SCORE_EXPR = {
  $let: {
    vars: {
      v: { $ifNull: ['$ratingCount', 0] },
      r: { $ifNull: ['$ratingAverage', 0] },
      d: { $ifNull: ['$downloadCount', 0] },
    },
    in: {
      $let: {
        vars: { vpm: { $add: ['$$v', 3] } }, // v + SHRINK_VOTES
        in: {
          $add: [
            // W_RATING * bayesianRating = (v/vpm)*R + (m/vpm)*C
            {
              $add: [
                { $multiply: [{ $divide: ['$$v', '$$vpm'] }, '$$r'] },
                { $multiply: [{ $divide: [3, '$$vpm'] }, 3.5] },
              ],
            },
            // W_DOWNLOAD * log10(downloadCount + 1)
            { $multiply: [0.5, { $log10: { $add: ['$$d', 1] } }] },
            // W_RECENCY * (createdAt_ms / MS_PER_DAY)
            { $multiply: [0.18, { $divide: [{ $toLong: '$createdAt' }, 86400000] }] },
          ],
        },
      },
    },
  },
};

module.exports = {
  async up(db) {
    const col = db.collection('blueprints');
    await col.createIndex(
      { deletedAt: 1, isPublished: 1, hotScore: -1, createdAt: -1 },
      { background: true, name: INDEX_NAME }
    );
    // Only docs with a real createdAt — a null date would produce a null score.
    await col.updateMany({ createdAt: { $type: 'date' } }, [{ $set: { hotScore: HOT_SCORE_EXPR } }]);
  },

  async down(db) {
    const col = db.collection('blueprints');
    try {
      await col.dropIndex(INDEX_NAME);
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') throw err;
    }
    await col.updateMany({ hotScore: { $exists: true } }, { $unset: { hotScore: '' } });
  },
};
