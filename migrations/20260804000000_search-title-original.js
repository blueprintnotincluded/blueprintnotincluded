'use strict';

// Adds `titleOriginal` to the blueprintsearch text index
// (spec/search-followups.md Part 1 §1).
//
// The DATA is derived and disposable — `npm run derive-search` populates the
// field, including on rows an earlier run already machine-translated. What
// needs a migration is the INDEX: Mongo will not alter a text index in place,
// and Mongoose's autoIndex hits IndexOptionsConflict against an existing
// index of the same name with different keys, which surfaces only as a
// logged error on a running server. So drop it here and let it be recreated.
//
// Order matters on deploy: run this BEFORE `derive-search`, so the backfill
// writes into an index that already covers the field. At ~5,300 rows the
// rebuild is a second or two.

const COLLECTION = 'blueprintsearch';
const INDEX_NAME = 'blueprint_search_text';

async function dropTextIndex(db) {
  const collections = await db.listCollections({ name: COLLECTION }).toArray();
  if (collections.length === 0) return; // fresh database — the app creates it
  const indexes = await db.collection(COLLECTION).indexes();
  if (!indexes.some(index => index.name === INDEX_NAME)) return; // already gone
  await db.collection(COLLECTION).dropIndex(INDEX_NAME);
}

module.exports = {
  async up(db) {
    await dropTextIndex(db);
    // Recreated explicitly rather than left to autoIndex, so the index exists
    // the moment the migration returns — a deploy that runs migrations before
    // the app comes up must not leave search unindexed in between.
    await db.collection(COLLECTION).createIndex(
      { title: 'text', titleOriginal: 'text', terms: 'text', description: 'text' },
      {
        weights: { title: 10, titleOriginal: 4, terms: 4, description: 1 },
        language_override: 'textLang',
        default_language: 'en',
        name: INDEX_NAME,
      }
    );
  },

  async down(db) {
    await dropTextIndex(db);
    await db.collection(COLLECTION).createIndex(
      { title: 'text', terms: 'text', description: 'text' },
      {
        weights: { title: 10, terms: 4, description: 1 },
        language_override: 'textLang',
        default_language: 'en',
        name: INDEX_NAME,
      }
    );
    // titleOriginal itself is left in place: it is inert once out of the
    // index, and the field disappears naturally when the schema drops it.
  },
};
