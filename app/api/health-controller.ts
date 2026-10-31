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

// Bounded so the compose healthcheck (5 s timeout) still gets an answer — a
// stalled Mongo reports as pingMs null with readyState still "connected".
export const DB_PING_TIMEOUT_MS = 2000;

export async function pingDbMs(): Promise<number | null> {
  const db = mongoose.connection.db;
  if (!db) return null;
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.admin().ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('ping timeout')), DB_PING_TIMEOUT_MS);
      }),
    ]);
    return Math.round(performance.now() - started);
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
    const dbOk = dbState === 1;
    const pingMs = dbOk ? await pingDbMs() : null;

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
