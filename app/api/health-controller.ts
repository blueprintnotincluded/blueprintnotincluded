import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { PreviewImageService } from './services/preview-image-service';

const READYSTATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

// Fixed once: `uptime` drifts by a second per read, the boot instant does not,
// and two processes reporting the same startedAt is how a host reboot (both
// compose projects restarting together) is told apart from one container's
// crash loop.
export const STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

// Bounded so the compose healthcheck (5 s timeout) still gets an answer. One
// ping is in flight at a time, shared by every concurrent health request:
// Promise.race leaves the losing ping running, and during a Mongo stall a ping
// per request would pile up on the pool the real queries need.
export const DB_PING_TIMEOUT_MS = 2000;

let inFlightPing: Promise<number> | null = null;

function sharedPing(): Promise<number> {
  if (!inFlightPing) {
    const started = performance.now();
    inFlightPing = Promise.resolve()
      .then(() => {
        const db = mongoose.connection.db;
        if (!db) throw new Error('no database handle');
        return db.admin().ping();
      })
      .then(() => Math.round(performance.now() - started))
      .finally(() => {
        inFlightPing = null;
      });
  }
  return inFlightPing;
}

/** Round-trip to Mongo in ms, or null when it failed or took longer than the timeout. */
export async function pingDbMs(): Promise<number | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      sharedPing(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ping timeout')), DB_PING_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class HealthController {
  public getHealth = async (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = READYSTATE_LABELS[dbState] ?? 'unknown';
    // "connected" is mongoose's bookkeeping; a server that stopped answering
    // keeps readyState 1 for a while. The ping is what makes `ok` true, and
    // the compose healthcheck reads only the status code.
    const pingMs = dbState === 1 ? await pingDbMs() : null;
    const dbOk = dbState === 1 && pingMs !== null;

    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMb = Math.round(memUsage.rss / 1024 / 1024);

    const status = dbOk ? 'ok' : 'degraded';
    const httpStatus = dbOk ? 200 : 503;

    res.status(httpStatus).json({
      status,
      checks: {
        db: { status: dbStatus, ok: dbOk, pingMs },
      },
      memory: {
        heapUsedMb,
        heapTotalMb,
        rssMb,
      },
      uptime: Math.floor(process.uptime()),
      startedAt: STARTED_AT,
      // The same sources /api/version reads (deploy.Dockerfile sets both), so a
      // monitor that keeps this body can date a change to a deploy.
      build: {
        commit: process.env.GIT_COMMIT ? process.env.GIT_COMMIT.slice(0, 7) : null,
        time: process.env.BUILD_DATE ?? null,
      },
      preview: PreviewImageService.instance.getStats(),
    });
  };
}
