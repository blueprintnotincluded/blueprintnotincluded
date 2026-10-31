import { expect } from 'chai';
import express from 'express';
import http from 'http';
import request from 'supertest';

import {
  SLOW_REQUEST_MS,
  accessLog,
  formatAccessLine,
  shouldLogAccess,
} from '../../app/api/middleware/access-log';

describe('access log', () => {
  describe('shouldLogAccess', () => {
    it('logs API calls and extension-less page routes', () => {
      for (const url of [
        '/api/getblueprints?olderthan=&limit=20',
        '/api/blueprints/abc/preview/card.webp',
        '/',
        '/b/abc',
        '/discover',
      ])
        expect(shouldLogAccess(url, 200, 5), url).to.equal(true);
    });

    it('skips successful static files and the healthcheck', () => {
      for (const url of [
        '/main.f9e7cdad44d12ea7.js',
        '/assets/ui_image/Tile.png',
        '/favicon.ico',
        '/site.webmanifest',
        '/api/health',
      ])
        expect(shouldLogAccess(url, 200, 5), url).to.equal(false);
    });

    it('logs any failure or slow response, whatever the path', () => {
      expect(shouldLogAccess('/assets/ui_image/Missing.png', 404, 2)).to.equal(true);
      expect(shouldLogAccess('/main.f9e7cdad44d12ea7.js', 200, SLOW_REQUEST_MS)).to.equal(true);
      // The healthcheck's own 503 is the one line of it worth keeping.
      expect(shouldLogAccess('/api/health', 503, 2)).to.equal(true);
      expect(shouldLogAccess('/api/health', 200, SLOW_REQUEST_MS + 1)).to.equal(false);
    });
  });

  describe('formatAccessLine', () => {
    it('is one greppable key=value line', () => {
      expect(
        formatAccessLine({
          method: 'GET',
          route: '/api/blueprints/:id',
          status: 200,
          ms: 12,
          bytes: 4321,
          ray: 'a53085b49a37bdbf-YVR',
          country: 'CA',
          url: '/api/blueprints/68a0',
        })
      ).to.equal(
        'access: method=GET route=/api/blueprints/:id status=200 ms=12 bytes=4321 ray=a53085b49a37bdbf-YVR country=CA url=/api/blueprints/68a0'
      );
    });

    it('fills what it does not have with "-" and keeps the line to one line', () => {
      const line = formatAccessLine({
        method: 'GET',
        route: '-',
        status: 404,
        ms: 1,
        bytes: null,
        ray: null,
        country: null,
        url: '/x\n\ty?' + 'a'.repeat(500),
      });
      expect(line).to.include(' bytes=- ray=- country=- url=/x_y?');
      expect(line).to.not.include('\n');
      expect(line.length).to.be.lessThan(400);
    });
  });

  describe('middleware', () => {
    function makeApp(lines: string[], clock?: { t: number }) {
      const app = express();
      app.use(accessLog({ log: l => lines.push(l), now: clock ? () => clock.t : undefined }));
      app.get('/api/things/:id', (req, res) => {
        if (clock) clock.t += 250;
        res.json({ id: req.params.id });
      });
      app.get('/api/boom', (_req, res) => res.status(500).send('no'));
      return app;
    }

    it('writes one line per request with the matched route, status, timing and Cloudflare headers', async () => {
      const lines: string[] = [];
      const clock = { t: 1000 };
      const res = await request(makeApp(lines, clock))
        .get('/api/things/42?x=1')
        .set('cf-ray', 'abc-YVR')
        .set('cf-ipcountry', 'CA');
      expect(res.status).to.equal(200);
      expect(res.headers['server-timing']).to.equal('app;dur=250');
      expect(lines).to.have.length(1);
      expect(lines[0]).to.equal(
        'access: method=GET route=/api/things/:id status=200 ms=250 bytes=11 ray=abc-YVR country=CA url=/api/things/42?x=1'
      );
    });

    it('records a request the client abandoned, marked aborted', async () => {
      const lines: string[] = [];
      const app = express();
      app.use(accessLog({ log: l => lines.push(l) }));
      app.get('/api/slow', (_req, res) => setTimeout(() => res.json({ late: true }), 150));
      const server = http.createServer(app);
      await new Promise<void>(resolve => server.listen(0, resolve));
      const port = (server.address() as { port: number }).port;
      try {
        await new Promise<void>(resolve => {
          const req = http.get({ port, path: '/api/slow' }, () => undefined);
          req.on('error', () => undefined);
          req.on('close', () => resolve());
          setTimeout(() => req.destroy(), 30);
        });
        // The server sees the hang-up on its own schedule; give it a tick.
        for (let i = 0; i < 20 && lines.length === 0; i++)
          await new Promise(r => setTimeout(r, 10));
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      expect(lines).to.have.length(1);
      expect(lines[0]).to.match(
        /^access: method=GET route=\/api\/slow status=\d+ aborted=1 ms=\d+ bytes=- ray=- country=- url=\/api\/slow$/
      );
    });

    it('records failures and leaves the healthcheck out', async () => {
      const lines: string[] = [];
      const app = makeApp(lines);
      app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
      await request(app).get('/api/health');
      await request(app).get('/api/boom');
      expect(lines).to.have.length(1);
      expect(lines[0]).to.match(
        /^access: method=GET route=\/api\/boom status=500 ms=\d+ bytes=2 ray=- country=- url=\/api\/boom$/
      );
    });
  });
});
