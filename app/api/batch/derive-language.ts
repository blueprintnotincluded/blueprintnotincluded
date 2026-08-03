// Backfill script: derive `sourceLang` for Blueprint.description and
// Comment.body using the same free local detector as the save paths
// (language-detection-service). No game database bootstrap needed — unlike
// derive-rooms/derive-metadata, this reads only stored text.
//
// Usage:
//   ts-node app/api/batch/derive-language.ts [--dry-run] [--limit N]
//
// --limit N reads a random sample of N documents per collection instead of
// the whole collection (see batch-sampling.ts).
//
// This is step 1 of spec/user-content-translation-impl.md: detection + storage
// only, no paid provider call. The printed language distribution is the first
// real evidence of whether the translation feature (steps 3-5) is worth
// building further — run this against a prod dump before committing to them.
// In the deploy image run the compiled output instead:
//   cd /bpni/build && node app/api/batch/derive-language.js [--dry-run]

import * as mongoose from 'mongoose';
import { Model } from 'mongoose';
import * as dotenv from 'dotenv';
import { BlueprintModel } from '../models/blueprint';
import { CommentModel } from '../models/comment';
import { detectLanguage } from '../services/language-detection-service';
import { parseBatchArgs, sampledCursor, describeScope } from './batch-sampling';

dotenv.config();

// Buffers $set writes and flushes them via bulkWrite so a full-collection
// backfill doesn't pay one round trip per changed document. Still idempotent
// (a mid-run failure just loses the unflushed buffer, safe to restart).
const BULK_BATCH_SIZE = 500;

function batchedSourceLangWriter(model: Model<any>, dryRun: boolean) {
  let pending: { updateOne: { filter: { _id: unknown }; update: { $set: { sourceLang: string | null } } } }[] = [];

  async function flush() {
    if (dryRun || pending.length === 0) return;
    await model.bulkWrite(pending);
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
  const cursor = sampledCursor(
    BlueprintModel.model,
    { deletedAt: null, description: { $nin: [null, ''] } },
    limit
  );
  let processed = 0;
  let updated = 0;
  const perLang = new Map<string, number>();
  let unconfident = 0;
  const writer = batchedSourceLangWriter(BlueprintModel.model, dryRun);

  for await (const doc of cursor) {
    processed++;
    const lang = detectLanguage(doc.description as string);
    if (lang == null) unconfident++;
    else perLang.set(lang, (perLang.get(lang) ?? 0) + 1);

    if (doc.sourceLang === (lang ?? null)) continue;
    updated++;
    await writer.queue(doc._id, lang);
  }
  await writer.flush();

  console.log(`\nBlueprint descriptions — processed: ${processed}, updated: ${updated}${dryRun ? ' (dry run)' : ''}`);
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
    const lang = detectLanguage(doc.body as string);
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
