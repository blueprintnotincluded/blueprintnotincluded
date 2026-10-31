// One greppable line per request, written to stdout like the memory-heartbeat
// and preview-render lines, so the container log can answer "what was slow,
// what failed, how much traffic, from where" without a separate log shipper.
//
//   access: method=GET route=/api/blueprints/:id status=200 ms=12 bytes=4321
//           ray=a5308…-YVR country=CA url=/api/blueprints/68a…
//
// A request the client abandoned before the response finished carries
// `aborted=1` after the status and is always logged.
//
// `route` is the Express pattern the request matched (`/*path` is the SPA
// shell, `-` is a file express.static served), `url` the raw request. `ray`
// and `country` are Cloudflare's headers — the ray id joins a line to the
// edge-side analytics and a user's error page, the country is the cheapest
// answer to "where are the users the Helsinki move hurt".
//
// Routine static traffic (hashed bundles, game art, favicons) is not logged
// unless it failed or was slow, nor is the container healthcheck's
// /api/health: with Docker's 10 MB × 3 json-file rotation, the lines that
// matter must not be scrolled out by the ones that never do.
//
// The same middleware adds `Server-Timing: app;dur=<ms>` (time to first
// header, measured here) so the browser's Network panel and a real-user
// metric can split origin time from the edge and the network in between.
import { NextFunction, Request, Response } from 'express';

export const SLOW_REQUEST_MS = 1000;

const FILE_EXTENSION = /\.[A-Za-z0-9]{1,12}$/;

export interface AccessEntry {
  method: string;
  route: string;
  status: number;
  ms: number;
  bytes: number | null;
  ray: string | null;
  country: string | null;
  url: string;
  /** The client went away before the response finished. */
  aborted?: boolean;
}

/** Everything under /api and every extension-less page route; files only when they failed or were slow. */
export function shouldLogAccess(url: string, status: number, ms: number): boolean {
  const pathname = url.split('?')[0];
  if (status >= 400 || ms >= SLOW_REQUEST_MS) return pathname !== '/api/health' || status >= 500;
  if (pathname === '/api/health') return false;
  if (pathname.startsWith('/api/')) return true;
  return !FILE_EXTENSION.test(pathname);
}

const clean = (value: string, max: number) =>
  value.replace(/[\s\x00-\x1f\x7f]+/g, '_').slice(0, max);

export function formatAccessLine(entry: AccessEntry): string {
  return (
    `access: method=${entry.method} route=${entry.route} status=${entry.status}` +
    (entry.aborted ? ' aborted=1' : '') +
    ` ms=${entry.ms} bytes=${entry.bytes ?? '-'}` +
    ` ray=${entry.ray ? clean(entry.ray, 40) : '-'} country=${entry.country ? clean(entry.country, 2) : '-'}` +
    ` url=${clean(entry.url, 300)}`
  );
}

const header = (req: Request, name: string): string | null => {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? String(first) : null;
};

const contentLength = (res: Response): number | null => {
  const value = res.getHeader('content-length');
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? n : null;
};

export interface AccessLogOptions {
  log?: (line: string) => void;
  now?: () => number;
}

export function accessLog(options: AccessLogOptions = {}) {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => performance.now());
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = now();
    // Set Server-Timing when the headers go out, not when the response ends:
    // that is the latest point a header can still be added, and "time to
    // first header" is the figure the browser's own timing lines up with.
    const writeHead = res.writeHead;
    res.writeHead = function patchedWriteHead(this: Response, ...args: unknown[]) {
      if (!res.headersSent) {
        const dur = Math.max(0, Math.round(now() - startedAt));
        const existing = res.getHeader('Server-Timing');
        res.setHeader('Server-Timing', existing ? `${existing}, app;dur=${dur}` : `app;dur=${dur}`);
      }
      return (writeHead as (...a: unknown[]) => Response).apply(this, args);
    } as Response['writeHead'];

    // `finish` is the response fully handed to the socket; a client that
    // gives up first (a cancelled page load, a timeout at the edge) emits
    // `close` without it. Those are the requests a latency spike is made of,
    // so they get a line too, marked, and always — a cut-off request has no
    // status worth filtering on.
    let logged = false;
    const emit = (aborted: boolean) => {
      if (logged) return;
      logged = true;
      const ms = Math.round(now() - startedAt);
      const url = req.originalUrl || req.url || '/';
      if (!aborted && !shouldLogAccess(url, res.statusCode, ms)) return;
      const routePath = (req.route as { path?: unknown } | undefined)?.path;
      log(
        formatAccessLine({
          method: req.method,
          route: typeof routePath === 'string' ? routePath : '-',
          status: res.statusCode,
          ms,
          bytes: contentLength(res),
          ray: header(req, 'cf-ray'),
          country: header(req, 'cf-ipcountry'),
          url,
          aborted,
        })
      );
    };
    res.on('finish', () => emit(false));
    res.on('close', () => emit(!res.writableFinished));
    next();
  };
}
