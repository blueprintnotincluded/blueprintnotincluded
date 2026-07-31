'use strict';

// Migration: convert legacy `Info` annotations into BlueprintsV2 world notes.
//
// `Info` was the website's own annotation type, stored as a pseudo-building —
// a blueprint item with an id the game has never heard of. It rendered fine on
// the site, but there is nowhere in a .blueprint file for a building the game
// cannot build, so `toBniBlueprint` skipped it: every annotation a user placed
// on the website was silently dropped the moment the blueprint was downloaded.
//
// World notes say the same thing in a format the game round-trips, so they are
// now the only annotation model. This migration rewrites stored documents to
// match; `Blueprint.importFromMdb` converts on read as well, so the two paths
// agree whether or not this has run yet.
//
// The mapping is a copy of lib/src/blueprint/note-conversion.ts, deliberately:
// a migration is a snapshot of the rules at the time it ran and must not drift
// when that module later changes. `frontColor` (the glyph colour inside the
// badge) is dropped — a world note marker is a single-colour sprite.
//
// up:   for every blueprint and blueprint version, move `data.blueprintItems`
//       entries with id 'Info' into `data.worldNotes`.
//
// down: convert text world notes back into `Info` items. Exact for the
//       documents `up` converted, which is the state a rollback in the deploy
//       window would find. It is approximate afterwards: a note authored in
//       game and imported after this migration also converts back (its symbol
//       and tint map cleanly, so it renders correctly as an `Info` badge, but
//       it is no longer the note the file it came from carried). Element notes
//       (type 1) have no `Info` equivalent and are left alone.
//
// Both directions are idempotent: after `up` no document has an `Info` item to
// find, and after `down` none has a text world note.

const COLLECTIONS = ['blueprints', 'blueprintversions'];
const BATCH = 500;

const TEXT_NOTE = 0;
const INFO_DEFAULT_BACK_COLOR = 0x007ad9;

// InfoIcon ordinal -> the mod's BlueprintNoteData.Symbol.
const INFO_ICON_SYMBOLS = [
  'note_info', // icon_inf
  'note_question', // icon_int
  'note_warn', // icon_exc
  'note_num_1',
  'note_num_2',
  'note_num_3',
  'note_num_4',
  'note_num_5',
  'note_num_6',
  'note_num_7',
  'note_num_8',
  'note_num_9',
];

function backColorToTintHex(backColor) {
  const rgb = (backColor >>> 0) & 0xffffff;
  return rgb.toString(16).padStart(6, '0') + 'ff';
}

function tintHexToBackColor(tinthex) {
  if (typeof tinthex !== 'string' || !/^[0-9a-fA-F]{6,8}$/.test(tinthex)) return undefined;
  return parseInt(tinthex.slice(0, 6), 16);
}

function infoToWorldNote(item) {
  const icon = typeof item.icon === 'number' ? item.icon : 0;
  const note = {
    x: (item.position && item.position.x) || 0,
    y: (item.position && item.position.y) || 0,
    type: TEXT_NOTE,
    tinthex: backColorToTintHex(
      typeof item.backColor === 'number' ? item.backColor : INFO_DEFAULT_BACK_COLOR
    ),
    symbol: INFO_ICON_SYMBOLS[icon] || INFO_ICON_SYMBOLS[0],
  };
  if (item.title) note.title = item.title;
  if (item.infoString) note.text = item.infoString;
  return note;
}

function worldNoteToInfo(note) {
  const item = { id: 'Info', position: { x: note.x || 0, y: note.y || 0 } };
  const icon = INFO_ICON_SYMBOLS.indexOf(note.symbol);
  if (icon > 0) item.icon = icon;
  const backColor = tintHexToBackColor(note.tinthex);
  if (backColor !== undefined && backColor !== INFO_DEFAULT_BACK_COLOR) item.backColor = backColor;
  if (note.title) item.title = note.title;
  if (note.text) item.infoString = note.text;
  return item;
}

async function rewrite(db, collectionName, filter, project, transform, label) {
  const collection = db.collection(collectionName);
  const cursor = collection.find(filter).project(project);

  let documents = 0;
  let converted = 0;
  let ops = [];

  for await (const doc of cursor) {
    const result = transform(doc);
    if (result == null) continue;
    documents++;
    converted += result.converted;
    ops.push({
      updateOne: { filter: { _id: doc._id }, update: { $set: result.set } },
    });
    if (ops.length >= BATCH) {
      await collection.bulkWrite(ops);
      ops = [];
    }
  }
  if (ops.length > 0) await collection.bulkWrite(ops);

  console.log(
    `${collectionName}: ${label} ${converted} annotation(s) across ${documents} document(s)`
  );
  return documents;
}

module.exports = {
  async up(db) {
    for (const name of COLLECTIONS) {
      await rewrite(
        db,
        name,
        { 'data.blueprintItems.id': 'Info' },
        { 'data.blueprintItems': 1, 'data.worldNotes': 1 },
        doc => {
          const items = (doc.data && doc.data.blueprintItems) || [];
          const infos = items.filter(item => item.id === 'Info');
          if (infos.length === 0) return null;
          const worldNotes = ((doc.data && doc.data.worldNotes) || []).concat(
            infos.map(infoToWorldNote)
          );
          return {
            converted: infos.length,
            set: {
              'data.blueprintItems': items.filter(item => item.id !== 'Info'),
              'data.worldNotes': worldNotes,
            },
          };
        },
        'converted'
      );

      const remaining = await db
        .collection(name)
        .countDocuments({ 'data.blueprintItems.id': 'Info' });
      if (remaining !== 0)
        throw new Error(
          `info-items-to-world-notes: ${remaining} ${name} document(s) still carry Info items`
        );
    }
  },

  async down(db) {
    for (const name of COLLECTIONS) {
      await rewrite(
        db,
        name,
        { 'data.worldNotes.type': TEXT_NOTE },
        { 'data.blueprintItems': 1, 'data.worldNotes': 1 },
        doc => {
          const notes = (doc.data && doc.data.worldNotes) || [];
          const text = notes.filter(note => (note.type || 0) === TEXT_NOTE);
          if (text.length === 0) return null;
          const items = ((doc.data && doc.data.blueprintItems) || []).concat(
            text.map(worldNoteToInfo)
          );
          const set = {
            'data.blueprintItems': items,
            'data.worldNotes': notes.filter(note => (note.type || 0) !== TEXT_NOTE),
          };
          return { converted: text.length, set };
        },
        'reverted'
      );
    }
  },
};
