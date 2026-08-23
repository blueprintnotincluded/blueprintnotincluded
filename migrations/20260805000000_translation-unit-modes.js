'use strict';

const COLLECTION = 'translationunits';
const OLD_INDEX = { textHash: 1, sourceLang: 1, targetLang: 1 };
const NEW_INDEX = { textHash: 1, sourceLang: 1, targetLang: 1, mode: 1 };

async function hasCollection(db) {
  return (await db.listCollections({ name: COLLECTION }).toArray()).length > 0;
}

async function dropMatchingIndex(db, keys) {
  if (!(await hasCollection(db))) return;
  const indexes = await db.collection(COLLECTION).indexes();
  const match = indexes.find(index => JSON.stringify(index.key) === JSON.stringify(keys));
  if (match) await db.collection(COLLECTION).dropIndex(match.name);
}

module.exports = {
  async up(db) {
    if (!(await hasCollection(db))) return;
    await db
      .collection(COLLECTION)
      .updateMany({ mode: { $exists: false } }, { $set: { mode: 'standard' } });
    await dropMatchingIndex(db, OLD_INDEX);
    await db.collection(COLLECTION).createIndex(NEW_INDEX, {
      unique: true,
      name: 'translation_unit_mode_key',
    });
  },

  async down(db) {
    if (!(await hasCollection(db))) return;
    await db.collection(COLLECTION).deleteMany({ mode: 'vi-romanized-title-v1' });
    await dropMatchingIndex(db, NEW_INDEX);
    await db.collection(COLLECTION).updateMany({}, { $unset: { mode: '' } });
    await db.collection(COLLECTION).createIndex(OLD_INDEX, {
      unique: true,
      name: 'translation_unit_text_key',
    });
  },
};
