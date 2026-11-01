import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { Routes } from './routes';
import { Database } from './api/db';
import requestIp from 'request-ip';
import { accessLog } from './api/middleware/access-log';
import fs from 'fs';
import {
  BBuilding,
  BuildableElement,
  OniItem,
  BuildMenuCategory,
  BuildMenuItem,
  BSpriteInfo,
  SpriteInfo,
  BSpriteModifier,
  SpriteModifier,
  ImageSource,
  TerrainFeature,
} from '../lib/index';

class App {
  public db: Database;
  public app: express.Application;
  public routePrv: Routes = new Routes();

  constructor() {
    // Read database. The committed runtime artifact is the loose JSON written by
    // `npm run import:2024`; the frontend zips this same JSON for its own fetch.
    let rawdata = fs.readFileSync('assets/database/database-2024.json', 'utf8');
    let json = JSON.parse(rawdata);

    ImageSource.init();

    let elements: BuildableElement[] = json.elements;
    BuildableElement.init();
    BuildableElement.load(elements);

    let buildMenuCategories: BuildMenuCategory[] = json.buildMenuCategories;
    BuildMenuCategory.init();
    BuildMenuCategory.load(buildMenuCategories);

    let buildMenuItems: BuildMenuItem[] = json.buildMenuItems;
    BuildMenuItem.init();
    BuildMenuItem.load(buildMenuItems);

    let uiSprites: BSpriteInfo[] = json.uiSprites;
    SpriteInfo.init();
    SpriteInfo.load(uiSprites);

    let spriteModifiers: BSpriteModifier[] = json.spriteModifiers;
    SpriteModifier.init();
    SpriteModifier.load(spriteModifiers);

    let buildings: BBuilding[] = json.buildings;
    OniItem.init();
    OniItem.load(buildings);

    TerrainFeature.init();
    TerrainFeature.load(json.terrainFeatures);

    // initialize database
    this.db = new Database();

    // Create a new express application instance and add middleware
    this.app = express();
    this.app.set('views', path.join(__dirname, 'views'));
    this.app.set('view engine', 'ejs');

    // One line per request (format in access-log.ts) and a Server-Timing
    // header. First, so the time covers every middleware below. Off under the
    // test suite, where supertest would flood the output, and with ACCESS_LOG=off.
    if (process.env.NODE_ENV !== 'test' && process.env.ACCESS_LOG !== 'off') {
      this.app.use(accessLog());
    }

    this.app.use(
      helmet.contentSecurityPolicy({
        directives: {
          'default-src': ["'self'"],
          'connect-src': [
            "'self'",
            // Cloudflare Web Analytics beacon (deploy/README.md "Monitoring");
            // inert until the zone injects it.
            'https://cloudflareinsights.com',
            '*.sentry.io',
            'https://www.google-analytics.com',
            'https://www.google.com',
            'https://www.gstatic.com',
          ],
          'style-src': ["'self'", "'unsafe-inline'"],
          'frame-src': ['https://www.google.com', 'http://localhost:4200'],
          'img-src': ["'self'", 'data:'],
          'script-src': [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://static.cloudflareinsights.com',
            'https://www.google.com',
            'https://www.gstatic.com',
            'https://www.googletagmanager.com',
          ],
          'script-src-elem': [
            "'self'",
            'https://static.cloudflareinsights.com',
            'https://www.google.com',
            'https://www.gstatic.com',
            'https://www.googletagmanager.com',
          ],
          'script-src-attr': ["'unsafe-inline'"],
          'frame-ancestors': ["'self'", 'https://oxygennotincluded.fandom.com'],
        },
      })
    );

    this.app.use(requestIp.mw());
    // inflate: false — compressed request bodies get a 415 instead of being
    // decoded. Node 20 has no fix for the bundled Brotli decoder's
    // out-of-bounds write (CVE-2026-111497), and body-parser 2.x decodes
    // `Content-Encoding: br` by default. No client of ours compresses uploads.
    this.app.use(express.json({ limit: '1mb', inflate: false }));

    // Subdomain redirects
    this.app.use((req, res, next) => {
      if (req.hostname === 'status.blueprintnotincluded.org') {
        return res.redirect(301, 'https://stats.uptimerobot.com/V6QANX8e9U');
      }
      return next();
    });

    this.routePrv.routes(this.app);

    //PixiBackend.initTextures();
  }
}

export default new App().app;
