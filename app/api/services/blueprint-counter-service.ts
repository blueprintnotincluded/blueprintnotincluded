import { AnyBulkWriteOperation } from 'mongoose';
import { BlueprintModel } from '../models/blueprint';

export type CounterKind = 'view' | 'download';

// Write-behind cache for blueprint view/download counters. Increments
// accumulate in memory and are flushed to Mongo in one bulkWrite every
// FLUSH_INTERVAL_MS, so hot blueprints cost one $inc per interval instead of
// one write per request. Counts are best-effort by design: a crash loses at
// most one interval's worth, and a failed flush drops its batch rather than
// retrying (a retry loop during a Mongo outage would be worse than losing
// approximate counts).
//
// Dedupe: one count per viewer per blueprint per kind within DEDUPE_TTL_MS,
// keyed on userId (logged in) or client IP (anonymous). This is what keeps a
// refresh-spam or details-page→editor navigation from counting twice.
//
// State is process-local — the deploy runs a single backend instance. With
// replicas the $inc flushes would still merge correctly, but dedupe becomes
// per-instance (same viewer could count once per replica): an acceptable
// over-count for approximate counters. Move `seen` to shared storage (e.g.
// Redis) if the API is ever replicated.
export class BlueprintCounterService {
  public static FLUSH_INTERVAL_MS = 30_000;
  public static DEDUPE_TTL_MS = 30 * 60_000;
  // Hard cap on dedupe entries — bounds memory if something floods unique
  // keys faster than the TTL prune can drop them
  public static MAX_DEDUPE_ENTRIES = 100_000;

  private static _instance: BlueprintCounterService | null = null;
  public static get instance(): BlueprintCounterService {
    if (this._instance == null) this._instance = new BlueprintCounterService();
    return this._instance;
  }

  private pending = new Map<string, { views: number; downloads: number }>();
  // dedupe key -> expiry epoch ms (insertion-ordered, so the first entry is
  // always the oldest — cheap eviction at the cap)
  private seen = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  // Returns true when the hit was counted, false when deduped.
  public record(kind: CounterKind, blueprintId: string, viewerKey: string): boolean {
    const key = `${kind}:${blueprintId}:${viewerKey}`;
    const now = Date.now();
    const expiry = this.seen.get(key);
    if (expiry != null && expiry > now) return false;

    if (this.seen.size >= BlueprintCounterService.MAX_DEDUPE_ENTRIES) {
      this.seen.delete(this.seen.keys().next().value as string);
    }
    this.seen.delete(key); // re-insert so insertion order tracks recency
    this.seen.set(key, now + BlueprintCounterService.DEDUPE_TTL_MS);

    let entry = this.pending.get(blueprintId);
    if (entry == null) {
      entry = { views: 0, downloads: 0 };
      this.pending.set(blueprintId, entry);
    }
    if (kind === 'view') entry.views++;
    else entry.downloads++;

    this.ensureTimer();
    return true;
  }

  private ensureTimer() {
    if (this.timer != null) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, BlueprintCounterService.FLUSH_INTERVAL_MS);
    // Never keep the process alive just to flush counters
    this.timer.unref();
  }

  public async flush(): Promise<void> {
    const now = Date.now();
    for (const [key, expiry] of this.seen) {
      if (expiry <= now) this.seen.delete(key);
    }

    if (this.pending.size === 0 || BlueprintModel.model == null) return;
    const batch = this.pending;
    this.pending = new Map();

    const operations: AnyBulkWriteOperation[] = [];
    for (const [blueprintId, counts] of batch) {
      const inc: Record<string, number> = {};
      if (counts.views > 0) inc.viewCount = counts.views;
      if (counts.downloads > 0) inc.downloadCount = counts.downloads;
      operations.push({
        updateOne: { filter: { _id: blueprintId }, update: { $inc: inc } },
      });
    }

    try {
      await BlueprintModel.model.bulkWrite(operations, { ordered: false });
    } catch (err) {
      console.log('blueprint counter flush error');
      console.log(err);
    }
  }

  // Test hook: clears all state and stops the flush timer.
  public reset(): void {
    this.pending.clear();
    this.seen.clear();
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
