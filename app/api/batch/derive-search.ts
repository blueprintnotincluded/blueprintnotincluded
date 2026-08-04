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
import { deriveSearchRow, SearchRowFields } from '../services/search-index-service';
import { detectLanguageCode } from '../services/language-detection-service';
import { TranslationService } from '../services/translation-service';
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

    const cursor = sampledCursor(BlueprintModel.model, {}, limit);
    let processed = 0;
    let created = 0;
    let refreshed = 0;
    let fresh = 0;
    let originalsBackfilled = 0;
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
      if (pending.length >= BULK_BATCH_SIZE) await flush();
      if (processed % 500 === 0) console.log(`  ...${processed} processed`);
    }
    await flush();

    console.log(`\nSearch rows — processed: ${processed}${dryRun ? ' (dry run)' : ''}`);
    console.log(`  new: ${created}, stale (re-derived): ${refreshed}, fresh: ${fresh}`);
    if (originalsBackfilled > 0) {
      console.log(`  titleOriginal backfilled on ${originalsBackfilled} already-translated row(s)`);
    }

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
  const rows: { blueprintId: mongoose.Types.ObjectId; title: string; origin: string }[] = [];
  for (let i = 0; i < blueprintIds.length; i += BULK_BATCH_SIZE) {
    const chunk = blueprintIds.slice(i, i + BULK_BATCH_SIZE);
    const chunkRows = await BlueprintSearchModel.model
      .find({ lang: 'en', blueprintId: { $in: chunk } })
      .select('blueprintId title origin')
      .lean();
    rows.push(...(chunkRows as { blueprintId: mongoose.Types.ObjectId; title: string; origin: string }[]));
  }

  const byTitle = new Map<string, { blueprintIds: mongoose.Types.ObjectId[]; sourceLang: string }>();
  let alreadyMachine = 0;
  for (const row of rows) {
    if (row.origin === 'machine') {
      alreadyMachine++;
      continue;
    }
    const lang = detectLanguageCode(row.title);
    if (lang == null || lang === 'en') continue;
    const group = byTitle.get(row.title);
    if (group != null) group.blueprintIds.push(row.blueprintId);
    else byTitle.set(row.title, { blueprintIds: [row.blueprintId], sourceLang: lang });
  }

  const uniqueTitles = [...byTitle.entries()];
  const documentCount = uniqueTitles.reduce((n, [, group]) => n + group.blueprintIds.length, 0);
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
        batch.map(([title, group]) => ({ sourceText: title, sourceLang: group.sourceLang, targetLang: 'en' })),
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
      const [, group] = batch[b];
      const [originalTitle] = batch[b];
      for (const blueprintId of group.blueprintIds) {
        ops.push({
          updateOne: {
            filter: { blueprintId, lang: 'en' },
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
// So stop guessing and ask the provider, which is far better than tinyld on
// short romanized text, and whose answer we already persist
// (TranslationUnit.detectedSourceLang).
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
  if (!TranslationService.instance.isConfigured()) {
    console.log('\nProvider-side detection — GOOGLE_TRANSLATE_API_KEY not set, skipping.');
    return 0;
  }

  const dictionary = getSearchTermDictionary();

  const rows: { blueprintId: mongoose.Types.ObjectId; title: string; origin: string }[] = [];
  for (let i = 0; i < blueprintIds.length; i += BULK_BATCH_SIZE) {
    const chunk = blueprintIds.slice(i, i + BULK_BATCH_SIZE);
    const chunkRows = await BlueprintSearchModel.model
      .find({ lang: 'en', origin: 'authored', blueprintId: { $in: chunk } })
      .select('blueprintId title origin')
      .lean();
    rows.push(...(chunkRows as { blueprintId: mongoose.Types.ObjectId; title: string; origin: string }[]));
  }

  const byTitle = new Map<string, mongoose.Types.ObjectId[]>();
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
    if (group != null) group.push(row.blueprintId);
    else byTitle.set(title, [row.blueprintId]);
  }

  // Batched by UNIQUE title text, same reason as translateTitles: the cache
  // row for a text written earlier in the same call is not visible to
  // findCached yet, so duplicates would each be billed.
  const candidates = [...byTitle.entries()];
  const documentCount = candidates.reduce((n, [, ids]) => n + ids.length, 0);
  console.log(
    `\nProvider-side detection — ${candidates.length} undetectable titles across ${documentCount} documents` +
      ` (${skippedDetected} already detected locally, ${skippedResolved} fully resolved by the term dictionary)`
  );

  if (dryRun || candidates.length === 0) return 0;

  let done = 0;
  let accepted = 0;
  let failedBatches = 0;
  for (let i = 0; i < candidates.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = candidates.slice(i, i + TRANSLATE_BATCH_SIZE);
    let results: Awaited<ReturnType<typeof TranslationService.instance.translateMany>>;
    try {
      results = await TranslationService.instance.translateMany(
        batch.map(([title]) => ({
          sourceText: title,
          sourceLang: null,
          targetLang: 'en',
          // Without this the ASCII short-circuit returns every one of these
          // titles untouched with no provider call — the pass would report
          // success having done nothing at all.
          forceProviderDetection: true,
        })),
        null
      );
    } catch (err) {
      console.log(`  batch ${i}-${i + batch.length} detection error, skipping`);
      console.log(err);
      done += batch.length;
      failedBatches++;
      continue;
    }

    const ops: mongoose.AnyBulkWriteOperation[] = [];
    for (let b = 0; b < batch.length; b++) {
      const result = results[b];
      const [title, ids] = batch[b];
      if (result.degraded) continue;
      const detected = normalizeContentLocale(result.sourceLang);
      // Both conditions matter. A non-English report with unchanged text means
      // the provider found nothing to translate; unchanged text with an English
      // report means it was English all along. Either way the row stays
      // authored, which is the correct, free outcome.
      if (detected == null || detected === 'en') continue;
      if (result.translatedText === title) continue;

      accepted++;
      for (const blueprintId of ids) {
        ops.push({
          updateOne: {
            filter: { blueprintId, lang: 'en' },
            update: {
              $set: { title: result.translatedText, titleOriginal: title, origin: 'machine' },
            },
          },
        });
      }
    }
    if (ops.length > 0) await BlueprintSearchModel.model.bulkWrite(ops as any);
    done += batch.length;
    console.log(`  ...${done}/${candidates.length} checked, ${accepted} translated`);
  }

  console.log(
    `  provider-side detection accepted ${accepted}/${candidates.length} titles ` +
      `(the rest came back English or unchanged and stay authored)`
  );
  return failedBatches;
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
