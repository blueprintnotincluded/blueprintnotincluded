import { Request, Response } from 'express';
import mongoose from 'mongoose';

const READYSTATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export class HealthController {
  public getHealth = (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = READYSTATE_LABELS[dbState] ?? 'unknown';
    const dbOk = dbState === 1;

    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMb = Math.round(memUsage.rss / 1024 / 1024);

    const status = dbOk ? 'ok' : 'degraded';
    const httpStatus = dbOk ? 200 : 503;

    res.status(httpStatus).json({
      status,
      checks: {
        db: { status: dbStatus, ok: dbOk },
      },
      memory: {
        heapUsedMb,
        heapTotalMb,
        rssMb,
      },
      uptime: Math.floor(process.uptime()),
    });
  };
}
