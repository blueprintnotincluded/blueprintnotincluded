// Backfill script: derive `sourceLang` for Blueprint.name and Comment.body
// using the same free local detector as the save paths
// (language-detection-service). No game database bootstrap needed — unlike
// derive-rooms/derive-metadata, this reads only stored text.
//
// Usage:
//   ts-node app/api/batch/derive-language.ts [--dry-run] [--limit N]
//
// --limit N reads a random sample of N documents per collection instead of
// the whole collection (see batch-sampling.ts).
//
// Blueprint.sourceLang is derived from the TITLE, not the description
// (spec/multilingual-search-plan.md §0 — titles are the corpus, descriptions
// are 22 documents site-wide). No locale prior here: a batch pass has no
// per-request Accept-Language to fall back to, so a title too short/
// ambiguous to detect on its own is left null, same as the live save path
// with no prior available. This is metadata/telemetry only — it does not
// drive the blueprintsearch machine-translation pivot, which re-detects from
// each row's own title (see search-index-service.ts's confidentTitleLang).
// In the deploy image run the compiled output instead:
//   cd /bpni/build && node app/api/batch/derive-language.js [--dry-run]

import * as mongoose from 'mongoose';
import { Model } from 'mongoose';
import * as dotenv from 'dotenv';
import { BlueprintModel } from '../models/blueprint';
import { CommentModel } from '../models/comment';
import { detectLanguageCode } from '../services/language-detection-service';
import { parseBatchArgs, sampledCursor, describeScope } from './batch-sampling';

dotenv.config();

// Buffers $set writes and flushes them via bulkWrite so a full-collection
// backfill doesn't pay one round trip per changed document. Still idempotent
// (a mid-run failure just loses the unflushed buffer, safe to restart).
const BULK_BATCH_SIZE = 500;

function batchedSourceLangWriter(model: Model<any>, dryRun: boolean) {
  let pending: { updateOne: { filter: { _id: unknown }; update: { $set: { sourceLang: string | null } } } }[] = [];

  async function flush() {
    if (pending.length === 0) return;
    // Dry run skips only the write — pending still clears, so a full-corpus
    // dry run stays bounded by BULK_BATCH_SIZE instead of buffering every
    // would-be update in memory.
    if (!dryRun) await model.bulkWrite(pending);
    pending = [];
  }

  return {
    async queue(id: unknown, sourceLang: string | null) {
      pending.push({ updateOne: { filter: { _id: id }, update: { $set: { sourceLang } } } });
      if (pending.length >= BULK_BATCH_SIZE) await flush();
    },
    flush,
  };
}

async function deriveBlueprints(dryRun: boolean, limit: number | null) {
  const cursor = sampledCursor(BlueprintModel.model, { deletedAt: null }, limit);
  let processed = 0;
  let updated = 0;
  const perLang = new Map<string, number>();
  let unconfident = 0;
  const writer = batchedSourceLangWriter(BlueprintModel.model, dryRun);

  for await (const doc of cursor) {
    processed++;
    const lang = detectLanguageCode(doc.name as string);
    if (lang == null) unconfident++;
    else perLang.set(lang, (perLang.get(lang) ?? 0) + 1);

    if (doc.sourceLang === (lang ?? null)) continue;
    updated++;
    await writer.queue(doc._id, lang);
  }
  await writer.flush();

  console.log(`\nBlueprint titles — processed: ${processed}, updated: ${updated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`  not confident: ${unconfident}`);
  reportLangs(perLang);
}

async function deriveComments(dryRun: boolean, limit: number | null) {
  const cursor = sampledCursor(CommentModel.model, { deletedAt: null }, limit);
  let processed = 0;
  let updated = 0;
  const perLang = new Map<string, number>();
  let unconfident = 0;
  const writer = batchedSourceLangWriter(CommentModel.model, dryRun);

  for await (const doc of cursor) {
    processed++;
    const lang = detectLanguageCode(doc.body as string);
    if (lang == null) unconfident++;
    else perLang.set(lang, (perLang.get(lang) ?? 0) + 1);

    if (doc.sourceLang === (lang ?? null)) continue;
    updated++;
    await writer.queue(doc._id, lang);
  }
  await writer.flush();

  console.log(`\nComments — processed: ${processed}, updated: ${updated}${dryRun ? ' (dry run)' : ''}`);
  console.log(`  not confident: ${unconfident}`);
  reportLangs(perLang);
}

function reportLangs(perLang: Map<string, number>) {
  const report = [...perLang.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ');
  console.log(`  by language — ${report || 'none detected'}`);
}

async function run(dryRun: boolean, limit: number | null) {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');

  await mongoose.connect(mongoUri);
  BlueprintModel.init();
  CommentModel.init();

  console.log(describeScope(limit, dryRun));
  await deriveBlueprints(dryRun, limit);
  await deriveComments(dryRun, limit);

  await mongoose.disconnect();
}

if (require.main === module) {
  const { dryRun, limit } = parseBatchArgs(process.argv);
  run(dryRun, limit).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
