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
//       entries with id 'Info' into `data.worldNotes`, recording the removed
//       items in a provenance collection.
//
// down: restore exactly what `up` converted, from that provenance — never a
//       note this migration did not create.
//
// PROVENANCE. `down` cannot identify its own work by inspection: a converted
// note is indistinguishable from one authored in game, so a reversal driven by
// "every text note" also eats notes that were always world notes. That is not
// hypothetical — the prod-copy rehearsal caught it, with a down/up cycle
// reporting 12 more conversions than the first pass. So `up` records the
// `Info` items it removed, keyed by document, and `down` reads that back.
//
// The record lives in its own collection rather than as a marker field on the
// notes themselves: a field would be permanent pollution of the blueprint
// model, written into every exported .blueprint from then on, to serve a
// rollback that is expected never to run.
//
// IDEMPOTENCE. `up` only ever selects documents that still carry an `Info`
// item, and upserts provenance by document key, so a re-run after a partial
// failure converts what is left and duplicates nothing. `down` deletes each
// provenance record once it has restored it, so a re-run finds no work and
// cannot re-append `Info` items. An up → down → up cycle returns to the same
// state as a single `up`.
//
// CONCURRENCY. Both directions rewrite whole arrays from a cursor snapshot, so
// a blueprint saved by its owner between the read and the write would be
// silently reverted to the snapshot. Every write therefore carries the array
// state it was computed from as a compare-and-set filter; a document that
// changed underneath fails to match and is re-read and retried, rather than
// clobbered. Provenance is written per document, and only once that
// document's own write is known to have landed.

const COLLECTIONS = ['blueprints', 'blueprintversions'];
const PROVENANCE = 'migration_20260730_info_notes';
const BATCH = 500;
// Updates in flight at once. Bounded so a migration cannot exhaust the
// driver's connection pool, but wide enough that per-document writes cost
// about what a batched write did.
const CONCURRENCY = 50;
const MAX_ATTEMPTS = 3;

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

// Key order is stable here — both sides of every comparison are built by
// infoToWorldNote, and BSON preserves insertion order on the way back out —
// but sort anyway so a hand-edited document cannot defeat the match.
function noteKey(note) {
  return JSON.stringify(
    Object.keys(note)
      .sort()
      .map(k => [k, note[k]])
  );
}

function provenanceId(collectionName, documentId) {
  return `${collectionName}:${documentId}`;
}

// Compare-and-set on the exact arrays the transform read. Absent fields are
// matched as absent: an `$exists: false` clause, not a null, so a document that
// gained the field concurrently fails the match like any other change.
function casFilter(documentId, data) {
  const filter = { _id: documentId };
  for (const field of ['blueprintItems', 'worldNotes']) {
    const value = data && data[field];
    filter[`data.${field}`] = value === undefined ? { $exists: false } : value;
  }
  return filter;
}

// Runs `plan(doc)` over every document matching `filter`, batching the writes
// it returns. Documents whose CAS filter no longer matches are collected and
// re-read on a subsequent pass — by then they have either been converted
// already (plan returns null, nothing to do) or carry the concurrent edit, and
// the fresh read is what gets written.
async function rewrite(db, collectionName, { filter, project, plan, label }) {
  const collection = db.collection(collectionName);

  // Documents whose write actually landed, keyed by id so a retried document
  // is counted once rather than once per pass — otherwise a contended run
  // reports more conversions than the corpus contains.
  const touched = new Map();
  let pass = 0;
  let scope = filter;

  while (pass < MAX_ATTEMPTS) {
    pass++;
    const cursor = collection.find(scope).project(project);
    const conflicts = [];
    let pending = [];

    // Individual updates issued in parallel waves rather than one bulkWrite:
    // bulkWrite reports matches only in aggregate, and `after` must be able to
    // tell whether *its own* document was written. Getting that wrong is worst
    // in `down`, where `after` drops the provenance record — a document whose
    // CAS was rejected would lose the record that makes it revertible at all.
    // The waves keep the round trips down to roughly what batching gave us.
    const flush = async () => {
      if (pending.length === 0) return;
      for (let start = 0; start < pending.length; start += CONCURRENCY) {
        const wave = pending.slice(start, start + CONCURRENCY);
        const results = await Promise.all(
          wave.map(op => collection.updateOne(op.filter, op.update))
        );
        for (let i = 0; i < wave.length; i++) {
          if (results[i].matchedCount === 1) {
            touched.set(String(wave[i].filter._id), wave[i].annotations);
            if (wave[i].after) await wave[i].after();
          } else {
            // Changed under us: re-read it on the next pass.
            conflicts.push(wave[i].filter._id);
          }
        }
      }
      pending = [];
    };

    for await (const doc of cursor) {
      const planned = plan(doc);
      if (planned == null) continue;
      const update = { $set: planned.set };
      if (planned.unset && Object.keys(planned.unset).length > 0) update.$unset = planned.unset;
      pending.push({
        filter: casFilter(doc._id, doc.data),
        update,
        after: planned.after,
        annotations: planned.annotations,
      });
      if (pending.length >= BATCH) await flush();
    }
    await flush();

    if (conflicts.length === 0) break;
    console.log(
      `${collectionName}: ${conflicts.length} document(s) changed during the pass, re-reading`
    );
    scope = { $and: [filter, { _id: { $in: conflicts } }] };
    if (pass === MAX_ATTEMPTS)
      throw new Error(
        `info-items-to-world-notes: ${collectionName} still contended after ${MAX_ATTEMPTS} passes ` +
          `(${conflicts.length} document(s)); re-run the migration`
      );
  }

  let annotations = 0;
  for (const count of touched.values()) annotations += count;
  console.log(
    `${collectionName}: ${label} ${annotations} annotation(s) across ${touched.size} document(s)`
  );
}

module.exports = {
  async up(db) {
    const provenance = db.collection(PROVENANCE);

    for (const name of COLLECTIONS) {
      await rewrite(db, name, {
        filter: { 'data.blueprintItems.id': 'Info' },
        project: { 'data.blueprintItems': 1, 'data.worldNotes': 1 },
        label: 'converted',
        plan: doc => {
          const items = (doc.data && doc.data.blueprintItems) || [];
          // Position is recorded alongside the item so `down` can splice each
          // one back where it was. Array order is not meaningful to the
          // importer, but it is the tie-break for equal z-indexes at render
          // time, so an exact reversal has to preserve it.
          const infos = [];
          items.forEach((item, at) => {
            if (item.id === 'Info') infos.push({ at, item });
          });
          if (infos.length === 0) return null;
          return {
            annotations: infos.length,
            set: {
              'data.blueprintItems': items.filter(item => item.id !== 'Info'),
              'data.worldNotes': ((doc.data && doc.data.worldNotes) || []).concat(
                infos.map(info => infoToWorldNote(info.item))
              ),
            },
            // Written after the document, so a crash between the two leaves an
            // un-reversible conversion rather than a record that would restore
            // `Info` items the document never lost.
            after: () =>
              provenance.updateOne(
                { _id: provenanceId(name, doc._id) },
                { $set: { collection: name, documentId: doc._id, infos } },
                { upsert: true }
              ),
          };
        },
      });

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
    const provenance = db.collection(PROVENANCE);

    for (const name of COLLECTIONS) {
      const records = new Map();
      for await (const record of provenance.find({ collection: name }))
        records.set(String(record.documentId), record);

      if (records.size === 0) {
        console.log(`${name}: nothing recorded by this migration to revert`);
        continue;
      }

      await rewrite(db, name, {
        filter: { _id: { $in: [...records.values()].map(r => r.documentId) } },
        project: { 'data.blueprintItems': 1, 'data.worldNotes': 1 },
        label: 'reverted',
        plan: doc => {
          const record = records.get(String(doc._id));
          if (record == null) return null;

          // Remove one note per recorded `Info` item, matched on content. A
          // note the user has since edited no longer matches and is left
          // alone — as is every note this migration did not create.
          const wanted = new Map();
          for (const info of record.infos) {
            const key = noteKey(infoToWorldNote(info.item));
            wanted.set(key, (wanted.get(key) || 0) + 1);
          }
          const kept = [];
          for (const note of (doc.data && doc.data.worldNotes) || []) {
            const key = noteKey(note);
            const outstanding = wanted.get(key) || 0;
            if (outstanding > 0) wanted.set(key, outstanding - 1);
            else kept.push(note);
          }

          // Splicing in ascending index order is the exact inverse of having
          // filtered them out.
          const items = ((doc.data && doc.data.blueprintItems) || []).slice();
          for (const info of [...record.infos].sort((a, b) => a.at - b.at))
            items.splice(info.at, 0, info.item);

          const set = { 'data.blueprintItems': items };
          const unset = {};
          // An empty array is not what the app writes — toMdbBlueprint omits
          // the field entirely — so leaving a husk behind would make the
          // rollback visible in stored data.
          if (kept.length > 0) set['data.worldNotes'] = kept;
          else unset['data.worldNotes'] = '';

          return {
            annotations: record.infos.length,
            set,
            unset,
            // Dropped only once the restore has landed, so an interrupted run
            // resumes rather than losing the ability to revert.
            after: () => provenance.deleteOne({ _id: provenanceId(name, doc._id) }),
          };
        },
      });
    }

    // Records whose documents have since been deleted would otherwise pin the
    // collection alive forever.
    await provenance.deleteMany({});
  },
};
