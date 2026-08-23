// Backfill: derive blueprintsearch rows for all blueprints with the same
// service the save path uses (search-index-service), then machine-translate
// any confidently non-English title into its row (phase 3b) so an English
// searcher can find it. Needs the game database bootstrap (term display names
// come from OniItem), like derive-rooms.
//
// Two translation passes follow the derivation:
//   1. confidently non-English titles (phase 3b);
//   2. titles our detector cannot place at all — short romanized/ASCII-fied
//      text — sent to the provider to ask (spec/search-followups.md Part 1 §2).
// Pass 2 is on by default; --skip-provider-detect turns it off.
//
// Usage:
//   ts-node app/api/batch/derive-search.ts [--dry-run] [--limit N] [--skip-provider-detect]
//
// --limit N reads a random sample of N documents (see batch-sampling.ts).
// Rerunnable/resumable: a row whose sourceHash already matches only has its
// ranking signals refreshed — title/origin/terms/termIds are left alone, so a
// re-run never stomps a title a prior run (or the live save path) already
// machine-translated. In the deploy image run it by task name instead:
//   cd /bpni/build && npm run derive-search

import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import {
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  ImageSource,
  OniItem,
  SpriteInfo,
  SpriteModifier,
} from '../../../lib/index';
import { BlueprintModel } from '../models/blueprint';
import { BlueprintSearchModel } from '../models/blueprint-search';
import { TranslationUnitModel } from '../models/translation-unit';
import { TranslationBudgetModel } from '../models/translation-budget';
import {
  deriveNativeSearchRow,
  deriveSearchRow,
  SearchRowFields,
} from '../services/search-index-service';
import { detectLanguageCode } from '../services/language-detection-service';
import { TranslationService } from '../services/translation-service';
import {
  isVietnameseTitleGateActive,
  VietnameseTitleTranslationOutcome,
  VietnameseTitleTranslationService,
  vietnameseTitleDryRunCaps,
} from '../services/vietnamese-title-translation-service';
import {
  GEMINI_VI_TITLE_BATCH_CHARACTERS,
  GEMINI_VI_TITLE_BATCH_SIZE,
} from '../services/vietnamese-title-prompts';
import { isUnrecoverableProviderError } from '../services/gemini-vietnamese-title-provider';
import { TranslationBudgetExceeded } from '../services/translation-service';
import { getSearchTermDictionary } from '../services/search-term-dictionary';
import { normalizeContentLocale, resolveTerms, tokenize } from '../../../lib/index';
import { parseBatchArgs, sampledCursor, describeScope } from './batch-sampling';

dotenv.config();

const BULK_BATCH_SIZE = 200;

// The subset of derived fields cheap/safe to refresh on an otherwise-fresh
// row (matches syncSearchRowStatus's field list) — everything that can drift
// without the title/terms/termIds themselves having changed.
function signalsOf(fields: SearchRowFields) {
  return {
    ratingAverage: fields.ratingAverage,
    ratingCount: fields.ratingCount,
    downloadCount: fields.downloadCount,
    forkCount: fields.forkCount,
    hotScore: fields.hotScore,
    isPublished: fields.isPublished,
    deletedAt: fields.deletedAt,
  };
}

// Same bootstrap as app.ts / derive-rooms: OniItem display names feed terms[].
function loadGameDatabase() {
  const dbPath = path.resolve(__dirname, '../../../assets/database/database-2024.json');
  const json = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  ImageSource.init();
  BuildableElement.init();
  BuildableElement.load(json.elements);
  BuildMenuCategory.init();
  BuildMenuCategory.load(json.buildMenuCategories);
  BuildMenuItem.init();
  BuildMenuItem.load(json.buildMenuItems);
  SpriteInfo.init();
  SpriteInfo.load(json.uiSprites);
  SpriteModifier.init();
  SpriteModifier.load(json.spriteModifiers);
  OniItem.init();
  OniItem.load(json.buildings);
}

async function run(dryRun: boolean, limit: number | null, providerDetect: boolean) {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  loadGameDatabase();
  await mongoose.connect(mongoUri);
  try {
    BlueprintModel.init();
    BlueprintSearchModel.init();
    // The title-translation pass goes through TranslationService, which reads
    // the translationunits cache and the budget rows directly. db.ts inits
    // these for the running app; a batch process gets no such bootstrap, and
    // the failure is a TypeError on an undefined model deep inside
    // translateMany — caught per batch and logged as "translation error,
    // skipping", so the run still exits 0 having translated nothing.
    TranslationUnitModel.init();
    TranslationBudgetModel.init();

    console.log(describeScope(limit, dryRun));

    // Existing rows' freshness keys, so unchanged blueprints are one $set of
    // signals, not a full text rewrite (keeps re-runs near no-op). `origin`
    // and `titleOriginal` ride along for the Part 1 §1 backfill below: a row
    // translated by an earlier run is FRESH, so it never reaches the full
    // re-derivation and would otherwise never acquire the field.
    const existing = new Map<string, { sourceHash: string; needsOriginal: boolean }>();
    for await (const row of BlueprintSearchModel.model
      .find({ lang: 'en' })
      .select('blueprintId sourceHash origin titleOriginal')
      .cursor()) {
      existing.set(row.blueprintId.toString(), {
        sourceHash: row.sourceHash,
        needsOriginal: row.origin === 'machine' && row.titleOriginal == null,
      });
    }

    // Existing native-language rows (§2.9) for whatever this run touches, so
    // a blueprint whose sourceLang moved (title re-authored in a different
    // language, or a re-run's detection now disagrees) prunes the old row
    // instead of leaving stale authored text behind forever. A list per
    // blueprint, not a single value: this is a batch pass over rows that may
    // predate the save-path's own pruning (upsertSearchRow's
    // pruneStaleNativeRow), so a blueprint can carry more than one leftover
    // authored non-'en' row here — a Map<string, string> would keep only the
    // last one the cursor happened to see and silently leave the rest.
    const existingNative = new Map<string, string[]>(); // blueprintId -> langs
    for await (const row of BlueprintSearchModel.model
      .find({ origin: 'authored', lang: { $ne: 'en' } })
      .select('blueprintId lang')
      .cursor()) {
      const key = row.blueprintId.toString();
      const langs = existingNative.get(key);
      if (langs != null) langs.push(row.lang);
      else existingNative.set(key, [row.lang]);
    }

    const cursor = sampledCursor(BlueprintModel.model, {}, limit);
    let processed = 0;
    let created = 0;
    let refreshed = 0;
    let fresh = 0;
    let originalsBackfilled = 0;
    let nativeWritten = 0;
    let nativePruned = 0;
    let pending: mongoose.AnyBulkWriteOperation[] = [];
    // Scopes the translation pass to exactly the blueprints this run touched —
    // matters when --limit samples a subset; with no limit this is every row.
    const processedIds: mongoose.Types.ObjectId[] = [];

    async function flush() {
      if (pending.length === 0) return;
      // Dry run skips only the write — pending still clears, so memory stays
      // bounded by BULK_BATCH_SIZE either way.
      if (!dryRun) await BlueprintSearchModel.model.bulkWrite(pending as any);
      pending = [];
    }

    for await (const doc of cursor) {
      processed++;
      processedIds.push(doc._id as mongoose.Types.ObjectId);
      const fields = deriveSearchRow(doc);
      const key = (doc._id as mongoose.Types.ObjectId).toString();
      const known = existing.get(key);
      const isFresh = known != null && known.sourceHash === fields.sourceHash;
      if (known == null) created++;
      else if (!isFresh) refreshed++;
      else fresh++;

      // Part 1 §1 backfill. A fresh machine-translated row's sourceHash is
      // pinned to the blueprint's current name, so `doc.name` IS the text its
      // translation was computed from — recoverable exactly, with no provider
      // call and no guessing. Idempotent: the flag clears once written.
      const backfillOriginal = isFresh && known!.needsOriginal;
      if (backfillOriginal) originalsBackfilled++;

      // A fresh row only has its signals refreshed — title/origin/terms/
      // termIds/sourceHash are left untouched so a re-run never overwrites a
      // title the live save path (or the translation pass below) already
      // machine-translated. A new or stale row gets the full derivation,
      // which resets origin to 'authored' — correct for stale, since the
      // underlying text changed and any prior translation is no longer valid.
      pending.push({
        updateOne: {
          filter: { blueprintId: doc._id as mongoose.Types.ObjectId, lang: fields.lang },
          update: {
            $set: isFresh
              ? backfillOriginal
                ? { ...signalsOf(fields), titleOriginal: doc.name ?? '' }
                : signalsOf(fields)
              : fields,
          },
          upsert: true,
        },
      });
      // Native-language row (§2.9): pure derivation, no translation call, so
      // unlike the pivot above there is nothing to protect by only touching
      // signals on a fresh row — always $set the full row. Nothing else ever
      // mutates an `origin: 'authored'` row, so this can never stomp a
      // translation the way blindly overwriting the pivot could.
      const native = deriveNativeSearchRow(doc, fields);
      if (native != null) {
        pending.push({
          updateOne: {
            filter: { blueprintId: doc._id as mongoose.Types.ObjectId, lang: native.lang },
            update: { $set: native },
            upsert: true,
          },
        });
        nativeWritten++;
      }
      const priorNativeLangs = existingNative.get(key) ?? [];
      for (const priorNativeLang of priorNativeLangs) {
        if (priorNativeLang === native?.lang) continue;
        pending.push({
          deleteOne: {
            filter: {
              blueprintId: doc._id as mongoose.Types.ObjectId,
              lang: priorNativeLang,
              origin: 'authored',
            },
          },
        });
        nativePruned++;
      }

      if (pending.length >= BULK_BATCH_SIZE) await flush();
      if (processed % 500 === 0) console.log(`  ...${processed} processed`);
    }
    await flush();

    console.log(`\nSearch rows — processed: ${processed}${dryRun ? ' (dry run)' : ''}`);
    console.log(`  new: ${created}, stale (re-derived): ${refreshed}, fresh: ${fresh}`);
    if (originalsBackfilled > 0) {
      console.log(`  titleOriginal backfilled on ${originalsBackfilled} already-translated row(s)`);
    }
    console.log(
      `  native-language rows: ${nativeWritten} written, ${nativePruned} pruned (stale sourceLang)`
    );

    let failedBatches = await translateTitles(dryRun, processedIds);
    if (providerDetect) {
      failedBatches += await detectAmbiguousTitles(dryRun, processedIds);
    } else {
      console.log('\nProvider-side detection — skipped (--skip-provider-detect).');
    }

    // A translation pass that failed every batch still wrote 5,308 perfectly
    // good rows, so without this the run reports success and the operator has
    // to read stack traces to notice the phase-3b half did nothing. Same
    // policy as import:2024 — an incomplete run exits non-zero.
    if (failedBatches > 0) {
      throw new Error(
        `${failedBatches} title-translation batch(es) failed — search rows are written, but ` +
          `some non-English titles were not machine-translated. Fix the cause and re-run; ` +
          `rows already translated are left alone.`
      );
    }
  } finally {
    // Unconditional: without this, any rejection between connect and here
    // leaks the connection, and the run only survives it because the CLI
    // entry point force-exits. The failed-batch error is thrown inside the
    // try, so it still propagates — just after disconnecting, as before.
    await mongoose.disconnect();
  }
}

// Phase 3b: machine-translate every confidently non-English title into its
// 'en' row's title, so an English searcher's lexical query can find it.
// Batches by UNIQUE title text, not by document — 86 blueprints sharing one
// title cost one translation call, matching the persistent textHash cache
// the live save path already benefits from (spec/multilingual-search-plan.md
// §1); without this, a single translateMany call spanning many duplicate
// titles would bill each occurrence separately, since the cache row for a
// text written earlier in the SAME call isn't visible yet.
const TRANSLATE_BATCH_SIZE = 100;

// Returns the number of batches that failed, so the caller can exit non-zero
// rather than reporting a successful run that translated nothing.
async function translateTitles(
  dryRun: boolean,
  blueprintIds: mongoose.Types.ObjectId[]
): Promise<number> {
  if (!TranslationService.instance.isConfigured()) {
    console.log('\nTitle translation — GOOGLE_TRANSLATE_API_KEY not set, skipping.');
    return 0;
  }

  // Chunked so an unlimited run (thousands of blueprints) never issues one
  // $in spanning the whole corpus.
  const rows: {
    blueprintId: mongoose.Types.ObjectId;
    title: string;
    origin: string;
    sourceHash: string;
  }[] = [];
  for (let i = 0; i < blueprintIds.length; i += BULK_BATCH_SIZE) {
    const chunk = blueprintIds.slice(i, i + BULK_BATCH_SIZE);
    const chunkRows = await BlueprintSearchModel.model
      .find({ lang: 'en', blueprintId: { $in: chunk } })
      .select('blueprintId title origin sourceHash')
      .lean();
    rows.push(...(chunkRows as typeof rows));
  }

  const byTitle = new Map<
    string,
    {
      rows: Array<{ blueprintId: mongoose.Types.ObjectId; sourceHash: string }>;
      sourceLang: string;
    }
  >();
  let alreadyMachine = 0;
  for (const row of rows) {
    if (row.origin === 'machine') {
      alreadyMachine++;
      continue;
    }
    const lang = detectLanguageCode(row.title);
    if (lang == null || lang === 'en') continue;
    const group = byTitle.get(row.title);
    const target = { blueprintId: row.blueprintId, sourceHash: row.sourceHash };
    if (group != null) group.rows.push(target);
    else byTitle.set(row.title, { rows: [target], sourceLang: lang });
  }

  const uniqueTitles = [...byTitle.entries()];
  const documentCount = uniqueTitles.reduce((n, [, group]) => n + group.rows.length, 0);
  console.log(
    `\nTitle translation — ${uniqueTitles.length} unique non-English titles across ${documentCount} documents` +
      ` (${alreadyMachine} rows already machine-translated, left alone)`
  );

  if (dryRun || uniqueTitles.length === 0) return 0;

  let done = 0;
  let failedBatches = 0;
  for (let i = 0; i < uniqueTitles.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = uniqueTitles.slice(i, i + TRANSLATE_BATCH_SIZE);
    let results: Awaited<ReturnType<typeof TranslationService.instance.translateMany>>;
    try {
      results = await TranslationService.instance.translateMany(
        batch.map(([title, group]) => ({
          sourceText: title,
          sourceLang: group.sourceLang,
          targetLang: 'en',
        })),
        null
      );
    } catch (err) {
      console.log(`  batch ${i}-${i + batch.length} translation error, skipping`);
      console.log(err);
      done += batch.length;
      failedBatches++;
      continue;
    }

    const ops: mongoose.AnyBulkWriteOperation[] = [];
    for (let b = 0; b < batch.length; b++) {
      const result = results[b];
      if (result.degraded) continue;
      const [originalTitle, group] = batch[b];
      // Same guard as deriveSearchRowWithTranslation and
      // detectAmbiguousTitles: a provider that handed the text back unchanged
      // translated nothing, and marking the row 'machine' would claim a
      // translation that isn't there while indexing the same string twice
      // (title + titleOriginal).
      if (result.translatedText === originalTitle) continue;
      for (const { blueprintId, sourceHash } of group.rows) {
        ops.push({
          updateOne: {
            filter: { blueprintId, lang: 'en', sourceHash },
            update: {
              $set: {
                title: result.translatedText,
                // Keeps the authored text in the index (Part 1 §1) — without
                // it, translating a title removes it from search.
                titleOriginal: originalTitle,
                origin: 'machine',
              },
            },
          },
        });
      }
    }
    if (ops.length > 0) await BlueprintSearchModel.model.bulkWrite(ops as any);
    done += batch.length;
    console.log(`  ...${done}/${uniqueTitles.length} unique titles translated`);
  }
  return failedBatches;
}

// Part 1 §2: titles our own detector cannot place — short, romanized or
// diacritic-stripped non-English ('Dien phan full') — clear neither of
// detectLanguageCode's gates (>=20 significant chars OR a non-ASCII signal),
// so phase 3b never spends a translation on them and they stay unreadable to
// an English searcher. These titles are absent from the 446 the first backfill
// found and no amount of re-running the pass above will pick them up.
//
// Gemini first identifies/restores/translates romanized Vietnamese. Only its
// explicit not-vietnamese results continue to Google's general provider-side
// detection; ambiguous or invalid results stay authored.
//
// Precision, not cost, is the constraint here (~59K characters one time,
// against a 500K/month free tier). Three things keep a wrong answer cheap:
//   - a title fully covered by the term dictionary is skipped — it is already
//     findable structurally, so there is nothing to buy;
//   - the result is accepted ONLY when the provider reports a non-English
//     source AND actually changed the text;
//   - titleOriginal (Part 1 §1) keeps the authored words in the index, so a
//     bad translation can add a wrong match but never remove a right one.
async function detectAmbiguousTitles(
  dryRun: boolean,
  blueprintIds: mongoose.Types.ObjectId[]
): Promise<number> {
  const dictionary = getSearchTermDictionary();

  const rows: {
    blueprintId: mongoose.Types.ObjectId;
    title: string;
    origin: string;
    sourceHash: string;
  }[] = [];
  for (let i = 0; i < blueprintIds.length; i += BULK_BATCH_SIZE) {
    const chunk = blueprintIds.slice(i, i + BULK_BATCH_SIZE);
    const chunkRows = await BlueprintSearchModel.model
      .find({ lang: 'en', origin: 'authored', blueprintId: { $in: chunk } })
      .select('blueprintId title origin sourceHash')
      .lean();
    rows.push(...(chunkRows as typeof rows));
  }

  const byTitle = new Map<
    string,
    Array<{ blueprintId: mongoose.Types.ObjectId; sourceHash: string }>
  >();
  let skippedResolved = 0;
  let skippedDetected = 0;
  for (const row of rows) {
    const title = row.title ?? '';
    if (title.trim().length === 0) continue;
    // Confidently anything (English included) is not this pass's business:
    // a confident non-English title was already handled by translateTitles.
    if (detectLanguageCode(title) != null) {
      skippedDetected++;
      continue;
    }
    const tokens = tokenize(title);
    if (tokens.length === 0) continue;
    if (resolveTerms(tokens, dictionary).unresolvedTokens.length === 0) {
      skippedResolved++;
      continue;
    }
    const group = byTitle.get(title);
    const target = { blueprintId: row.blueprintId, sourceHash: row.sourceHash };
    if (group != null) group.push(target);
    else byTitle.set(title, [target]);
  }

  // Batched by UNIQUE title text, same reason as translateTitles: the cache
  // row for a text written earlier in the same call is not visible to
  // findCached yet, so duplicates would each be billed.
  const candidates = [...byTitle.entries()];
  const documentCount = candidates.reduce((n, [, ids]) => n + ids.length, 0);
  const sourceCharacters = candidates.reduce((n, [title]) => n + title.length, 0);
  const geminiBatches = batchVietnameseCandidates(candidates);
  const dryRunCaps = vietnameseTitleDryRunCaps();
  console.log(
    `\nRomanized Vietnamese census — ${candidates.length} unique candidate titles across ${documentCount} documents` +
      ` (${skippedDetected} already detected locally, ${skippedResolved} fully resolved by the term dictionary)`
  );
  console.log(`  source characters: ${sourceCharacters}`);
  console.log(
    `  planned Gemini batches: ${geminiBatches.length} (max ${GEMINI_VI_TITLE_BATCH_SIZE} titles / ` +
      `${GEMINI_VI_TITLE_BATCH_CHARACTERS} source characters each, concurrency 1, retries 0)`
  );
  console.log(
    `  reservation: max ${dryRunCaps.inputTokens} input + ${dryRunCaps.outputTokens} output tokens/call; ` +
      `${geminiBatches.length * dryRunCaps.inputTokens} input + ` +
      `${geminiBatches.length * dryRunCaps.outputTokens} output tokens total; ` +
      `${geminiBatches.length * dryRunCaps.maximumMicroUsd} micro-USD maximum`
  );

  if (dryRun || candidates.length === 0) return 0;

  // With the gate off — its default, and the state the README has prod deploy
  // in — every candidate comes back 'invalid' and contributes nothing to
  // googleCandidates, so the Google detection pass this gate sits in front of
  // would silently do nothing at all. That is a regression against the shipped
  // behaviour, not a decision. Send the whole census straight to Google
  // instead, and say which pass actually ran.
  if (!isVietnameseTitleGateActive()) {
    console.log(
      '  Gemini romanized-Vietnamese gate inactive (kill switch, GEMINI_API_KEY, or monthly ' +
        'allowance) — continuing every candidate to Google provider-side detection.'
    );
    return continueNotVietnameseWithGoogle(candidates);
  }

  let done = 0;
  let accepted = 0;
  let failedBatches = 0;
  const googleCandidates: typeof candidates = [];
  for (let i = 0; i < geminiBatches.length; i++) {
    const batch = geminiBatches[i];
    let results: VietnameseTitleTranslationOutcome[];
    try {
      results = await VietnameseTitleTranslationService.instance.translateMany(
        batch.map(([title], index) => ({ id: `vi-${i}-${index}`, text: title })),
        null
      );
    } catch (err) {
      failedBatches++;
      // A bad key, a revoked key, a rate limit, or an exhausted allowance is
      // not a per-batch hiccup: every remaining batch hits it too, and each
      // attempt reserves budget BEFORE the provider call. Continuing would
      // spend the entire monthly allowance on failures. Stop, and say plainly
      // that this one needs a person.
      if (err instanceof TranslationBudgetExceeded || isUnrecoverableProviderError(err)) {
        console.log(
          `  Gemini pass STOPPED at batch ${i + 1}/${geminiBatches.length} — needs action, ` +
            `not a retry: ${(err as Error).message}`
        );
        console.log(
          `  ${candidates.length - done} candidate title(s) left unprocessed. Re-running after ` +
            `the cause is fixed is safe: accepted translations are cached and already-translated ` +
            `rows are skipped.`
        );
        break;
      }
      console.log(`  Gemini batch ${i + 1}/${geminiBatches.length} error, skipping`);
      console.log(err);
      done += batch.length;
      continue;
    }

    const ops: mongoose.AnyBulkWriteOperation[] = [];
    for (let b = 0; b < batch.length; b++) {
      const result = results[b];
      const [title, ids] = batch[b];
      if (result.status === 'not-vietnamese') {
        googleCandidates.push(batch[b]);
        continue;
      }
      if (result.status !== 'translated' || result.translatedText == null) continue;

      accepted++;
      for (const { blueprintId, sourceHash } of ids) {
        ops.push({
          updateOne: {
            filter: { blueprintId, lang: 'en', sourceHash },
            update: {
              $set: {
                title: result.translatedText,
                titleOriginal: title,
                origin: 'machine',
              },
            },
          },
        });
      }
    }
    if (ops.length > 0) await BlueprintSearchModel.model.bulkWrite(ops as any);
    done += batch.length;
    console.log(`  ...${done}/${candidates.length} checked by Gemini, ${accepted} translated`);
  }

  failedBatches += await continueNotVietnameseWithGoogle(googleCandidates);
  console.log(
    `  Gemini accepted ${accepted}/${candidates.length} titles; ` +
      `${googleCandidates.length} explicit not-vietnamese result(s) continued to Google`
  );
  return failedBatches;
}

type AmbiguousCandidate = [
  string,
  Array<{ blueprintId: mongoose.Types.ObjectId; sourceHash: string }>,
];

export function batchVietnameseCandidates(
  candidates: AmbiguousCandidate[]
): AmbiguousCandidate[][] {
  const batches: AmbiguousCandidate[][] = [];
  let batch: AmbiguousCandidate[] = [];
  let characters = 0;
  for (const candidate of candidates) {
    const nextCharacters = characters + candidate[0].length;
    if (
      batch.length > 0 &&
      (batch.length >= GEMINI_VI_TITLE_BATCH_SIZE ||
        nextCharacters > GEMINI_VI_TITLE_BATCH_CHARACTERS)
    ) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(candidate);
    characters += candidate[0].length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function continueNotVietnameseWithGoogle(candidates: AmbiguousCandidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  if (!TranslationService.instance.isConfigured()) {
    // Return 0 rather than a count: the caller's tally is FAILED BATCHES, and
    // nothing failed here. The number operators need is the skipped titles, so
    // say it here where it is unambiguous.
    const documents = candidates.reduce((n, [, rows]) => n + rows.length, 0);
    console.log(
      `  Google continuation — GOOGLE_TRANSLATE_API_KEY not set: ${candidates.length} title(s) ` +
        `across ${documents} document(s) left authored.`
    );
    return 0;
  }
  let failures = 0;
  for (let i = 0; i < candidates.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + TRANSLATE_BATCH_SIZE);
    try {
      const results = await TranslationService.instance.translateMany(
        batch.map(([title]) => ({
          sourceText: title,
          sourceLang: null,
          targetLang: 'en',
          forceProviderDetection: true,
        })),
        null
      );
      const ops: mongoose.AnyBulkWriteOperation[] = [];
      for (let index = 0; index < batch.length; index++) {
        const result = results[index];
        const [title, rows] = batch[index];
        const detected = normalizeContentLocale(result.sourceLang);
        if (
          result.degraded ||
          detected == null ||
          detected === 'en' ||
          result.translatedText === title
        )
          continue;
        for (const { blueprintId, sourceHash } of rows) {
          ops.push({
            updateOne: {
              filter: { blueprintId, lang: 'en', sourceHash },
              update: {
                $set: {
                  title: result.translatedText,
                  titleOriginal: title,
                  origin: 'machine',
                },
              },
            },
          });
        }
      }
      if (ops.length > 0) await BlueprintSearchModel.model.bulkWrite(ops as any);
    } catch (error) {
      console.log(`  Google continuation batch ${i}-${i + batch.length} error, skipping`);
      console.log(error);
      failures++;
    }
  }
  return failures;
}

if (require.main === module) {
  const { dryRun, limit } = parseBatchArgs(process.argv);
  // On by default: leaving it off is what makes "everything is readable in
  // English" quietly false for the romanized population. Re-runs are near-free
  // (translationunits is keyed by text hash, so a title asked about before is
  // a cache read), and rows already 'machine' are skipped outright.
  const providerDetect = !process.argv.includes('--skip-provider-detect');
  run(dryRun, limit, providerDetect).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
