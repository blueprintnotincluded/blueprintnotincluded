// Shared --limit handling for the blueprint backfill scripts.
//
// A full pass over the blueprint collection loads every document's stored
// `data` blob (tens of KB each), so a dry run on the live corpus takes ~10
// minutes — long enough that nobody runs one, which defeats the point of
// having a dry run at all. `--limit N` makes the diagnostic runs cheap.
//
// The capped run SAMPLES RANDOMLY rather than taking the first N documents.
// Natural order correlates with insertion date, and every question these
// reports answer (which prefab ids are unknown, how categories redistribute)
// correlates with age too — a head-of-collection sample would report the
// oldest blueprints' problems as if they were the corpus average. A random
// sample's percentages extrapolate; a biased one's don't.

import { Model } from 'mongoose';

export interface BatchRunOptions {
  dryRun: boolean;
  limit: number | null;
}

// Parses `--dry-run` and `--limit N` (or `--limit=N`) out of argv. Throws on a
// malformed limit rather than silently running the full pass the caller was
// explicitly trying to avoid.
export function parseBatchArgs(argv: string[]): BatchRunOptions {
  const dryRun = argv.includes('--dry-run');

  let rawLimit: string | undefined;
  const inlineIndex = argv.findIndex(arg => arg.startsWith('--limit='));
  if (inlineIndex !== -1) {
    rawLimit = argv[inlineIndex].slice('--limit='.length);
  } else {
    const flagIndex = argv.indexOf('--limit');
    if (flagIndex !== -1) rawLimit = argv[flagIndex + 1];
  }

  if (rawLimit === undefined) return { dryRun, limit: null };

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer (got '${rawLimit ?? ''}')`);
  }

  return { dryRun, limit };
}

// An async-iterable cursor over `filter`: every match in natural order when
// limit is null, otherwise a random sample of `limit` documents. The sampled
// branch yields plain objects rather than hydrated Mongoose documents — the
// callers only read stored fields and update by _id, so this is invisible to
// them, but don't call document methods on the result.
export function sampledCursor(
  model: Model<any>,
  filter: Record<string, unknown>,
  limit: number | null
): AsyncIterable<any> {
  if (limit == null) return model.find(filter).cursor();
  return model.aggregate([{ $match: filter }, { $sample: { size: limit } }]).cursor();
}

// One line describing the scope a report covers, so a sampled run's numbers
// are never mistaken for corpus totals when pasted somewhere else.
export function describeScope(limit: number | null, dryRun: boolean): string {
  const scope = limit == null ? 'full collection' : `random sample of up to ${limit}`;
  return `Scope: ${scope}${dryRun ? ', dry run (no writes)' : ''}`;
}
