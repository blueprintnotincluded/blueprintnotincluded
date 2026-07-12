// Periodic per-process memory logging for leak triage. The container-level
// memory graph on DO App Platform cannot say *which* process is growing (API
// parent vs. preview render worker) or whether growth is heap, native
// (external/arrayBuffers — sharp, canvas, IPC buffers) or allocator
// fragmentation (rss climbing while heapUsed stays flat). One greppable line
// per process every few minutes answers that from `doctl apps logs`.
export const MEMORY_HEARTBEAT_INTERVAL_MS = 5 * 60_000;

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function formatMemoryLine(label: string, mem: NodeJS.MemoryUsage): string {
  return (
    `memory-heartbeat: ${label} rss=${mb(mem.rss)}MB` +
    ` heapUsed=${mb(mem.heapUsed)}MB heapTotal=${mb(mem.heapTotal)}MB` +
    ` external=${mb(mem.external)}MB arrayBuffers=${mb(mem.arrayBuffers)}MB`
  );
}

/**
 * Log this process's memory usage every `intervalMs`, plus once immediately
 * (the post-boot baseline every later line is read against). Unref'd so it
 * never keeps the process alive; no-op under NODE_ENV=test.
 */
export function startMemoryHeartbeat(
  label: string,
  intervalMs = MEMORY_HEARTBEAT_INTERVAL_MS
): NodeJS.Timeout | null {
  if (process.env.NODE_ENV === 'test') return null;
  const log = () => console.log(formatMemoryLine(label, process.memoryUsage()));
  log();
  const timer = setInterval(log, intervalMs);
  timer.unref();
  return timer;
}
