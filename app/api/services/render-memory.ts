// Memory sizing for the preview render worker (see preview-render-worker.ts).
//
// The worker self-recycles when its RSS crosses a cap. That cap must leave
// room inside the container for the parent API process (~200MB Express +
// sharp) plus render overshoot — the recycle check runs between renders, and
// a single render can add ~60MB before it fires. A flat 384MB default
// OOM-killed 512MiB DO instances (the cgroup killed the whole container
// before the worker ever reached the cap), so the default derives from the
// smallest believable container memory limit.
//
// Detection is two-signal because no single source works everywhere:
//   - cgroup limit files: authoritative under Docker/Kubernetes, but DO App
//     Platform runs gVisor, which mounts a cgroupfs that reports the
//     "unlimited" sentinel (~2^63) — useless there.
//   - os.totalmem(): gVisor scopes it to the sandbox (512MB on basic-xxs),
//     verified in a DO console 2026-07-09. Under plain Docker it reports the
//     host's RAM, so it cannot replace the cgroup signal.
// The effective limit is the smaller of the two; a dev machine or CI runner
// with plenty of RAM lands on the 384MB ceiling either way.
import * as fs from 'fs';
import * as os from 'os';

export const PARENT_HEADROOM_MB = 320;
export const MIN_RSS_CAP_MB = 128;
export const MAX_RSS_CAP_MB = 384;

const CGROUP_LIMIT_PATHS = [
  '/sys/fs/cgroup/memory.max', // v2
  '/sys/fs/cgroup/memory/memory.limit_in_bytes', // v1
];

// Container memory limit in MB from the cgroup. Null when absent, "max", or
// an implausible (unlimited-sentinel) value — gVisor reports ~2^63, cgroup v1
// unlimited is similar; anything past 1TB is not a real app-container limit.
export function readCgroupMemoryLimitMb(paths: string[] = CGROUP_LIMIT_PATHS): number | null {
  for (const path of paths) {
    try {
      const raw = fs.readFileSync(path, 'utf8').trim();
      if (raw === 'max') return null;
      const bytes = Number(raw);
      if (Number.isFinite(bytes) && bytes > 0 && bytes < 2 ** 40) {
        return bytes / (1024 * 1024);
      }
    } catch {
      // File absent — try the next cgroup layout.
    }
  }
  return null;
}

export interface ResolvedRssCap {
  maxRssMb: number;
  /** Human-readable derivation, logged once at worker startup. */
  detail: string;
}

export function resolveMaxRssMb(opts?: {
  env?: string;
  cgroupLimitMb?: number | null;
  totalMemMb?: number;
}): ResolvedRssCap {
  const env = opts && 'env' in opts ? opts.env : process.env.PREVIEW_WORKER_MAX_RSS_MB;
  let invalidEnvNote = '';
  if (env != null) {
    const fromEnv = Number(env);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return { maxRssMb: fromEnv, detail: `rss cap ${fromEnv}MB (PREVIEW_WORKER_MAX_RSS_MB)` };
    }
    invalidEnvNote = `; ignored invalid PREVIEW_WORKER_MAX_RSS_MB "${env}"`;
  }
  const cgroupLimitMb =
    opts && 'cgroupLimitMb' in opts ? opts.cgroupLimitMb : readCgroupMemoryLimitMb();
  const totalMemMb = opts?.totalMemMb ?? os.totalmem() / (1024 * 1024);
  const limitMb = Math.min(cgroupLimitMb ?? Infinity, totalMemMb);
  const maxRssMb = Math.min(Math.max(limitMb - PARENT_HEADROOM_MB, MIN_RSS_CAP_MB), MAX_RSS_CAP_MB);
  const source = cgroupLimitMb != null && cgroupLimitMb <= totalMemMb ? 'cgroup' : 'os.totalmem';
  return {
    maxRssMb,
    detail:
      `rss cap ${Math.round(maxRssMb)}MB` +
      ` (memory limit ${Math.round(limitMb)}MB via ${source}${invalidEnvNote})`,
  };
}
