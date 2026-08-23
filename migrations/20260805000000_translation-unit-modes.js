'use strict';

// Adds `mode` to translationunits and widens the unique key to include it, so
// a Gemini romanized-Vietnamese row and a Google row for the same text hash
// can coexist instead of colliding.
//
// Indexes are matched by KEY PATTERN, never by name. Mongoose's autoIndex
// races this migration on every deploy: whichever runs first creates the
// index, and if the two disagree about its NAME the loser dies with
// "Index already exists with a different name". That is not hypothetical —
// it is how this migration first failed. Matching on the key pattern makes
// the migration converge from any starting state:
//
//   - fresh database                  -> creates it
//   - autoIndex got there first       -> adopts it, no data touched
//   - migration already ran           -> no-op
//
// which is what "idempotent" has to mean here, because staging and production
// share one database: every migration is run at least twice against the same
// data, and the second run must be a no-op rather than an error.

const COLLECTION = 'translationunits';
const OLD_INDEX = { textHash: 1, sourceLang: 1, targetLang: 1 };
// Both names are the ones Mongo GENERATES for these key patterns, which is
// also what Mongoose's autoIndex produces from the schema — the convention
// the other index migrations in this directory follow. Inventing a friendlier
// name is what broke this migration: the schema declares no name, so autoIndex
// built the auto-named index and the migration then demanded a different one
// for the same keys.
const OLD_INDEX_NAME = 'textHash_1_sourceLang_1_targetLang_1';
const NEW_INDEX = { textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 };
const NEW_INDEX_NAME = 'textHash_1_sourceLang_1_targetLang_1_mode_1';

async function hasCollection(db) {
  return (await db.listCollections({ name: COLLECTION }).toArray()).length > 0;
}

// Mongo preserves index key order, and so does JSON.stringify over an object
// literal, so comparing the serialized key is an exact match on the compound
// index — not merely on the set of fields.
async function indexByKey(db, keys) {
  const indexes = await db.collection(COLLECTION).indexes();
  return indexes.find(index => JSON.stringify(index.key) === JSON.stringify(keys));
}

async function dropIndexByKey(db, keys) {
  const match = await indexByKey(db, keys);
  if (match) await db.collection(COLLECTION).dropIndex(match.name);
}

async function ensureUniqueIndex(db, keys, name) {
  const existing = await indexByKey(db, keys);
  if (existing) {
    // Right keys, right options, right name: nothing to do — this is the
    // autoIndex-got-there-first case, and the common one. Anything else (a
    // non-unique variant, or a legacy hand-picked name) is replaced, since
    // Mongo cannot alter an index in place.
    if (existing.name === name && existing.unique === true) return;
    await db.collection(COLLECTION).dropIndex(existing.name);
  }
  await db.collection(COLLECTION).createIndex(keys, { unique: true, name });
}

module.exports = {
  async up(db) {
    if (!(await hasCollection(db))) return;
    // Backfill before the key widens: the old index does not include `mode`,
    // so this cannot collide, and the new one is never built over rows
    // missing the field.
    await db
      .collection(COLLECTION)
      .updateMany({ mode: { $exists: false } }, { $set: { mode: 'standard' } });
    await dropIndexByKey(db, OLD_INDEX);
    await ensureUniqueIndex(db, NEW_INDEX, NEW_INDEX_NAME);
  },

  async down(db) {
    if (!(await hasCollection(db))) return;
    // Gemini rows must go before the key narrows — they are cache entries,
    // rebuildable at the cost of re-asking the provider. Standard rows keep
    // their text and are untouched.
    await db.collection(COLLECTION).deleteMany({ mode: 'vi-romanized-title-v1' });
    await dropIndexByKey(db, NEW_INDEX);
    await db.collection(COLLECTION).updateMany({}, { $unset: { mode: '' } });
    await ensureUniqueIndex(db, OLD_INDEX, OLD_INDEX_NAME);
  },
};
