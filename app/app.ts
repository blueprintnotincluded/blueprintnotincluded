import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { Routes } from './routes';
import { Database } from './api/db';
import requestIp from 'request-ip';
import { Auth } from './api/auth';
import passport from 'passport';
import * as fs from 'fs';
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
} from '../lib/index';

class App {
  public db: Database;
  public app: express.Application;
  public auth: Auth;
  public routePrv: Routes = new Routes();

  constructor() {
    // Read database
    let rawdata = fs.readFileSync('assets/database/database.json').toString();
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

    // initialize database and authentication middleware
    this.db = new Database();
    this.auth = new Auth();

    // Create a new express application instance and add middleware
    this.app = express();
    this.app.set('views', path.join(__dirname, 'views'));
    this.app.set('view engine', 'ejs');

    this.app.use(
      helmet.contentSecurityPolicy({
        directives: {
          'default-src': ["'self'"],
          'connect-src': [
            "'self'",
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
            'https://www.google.com',
            'https://www.gstatic.com',
            'https://www.googletagmanager.com',
          ],
          'script-src-elem': [
            "'self'",
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
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(passport.initialize());
    this.routePrv.routes(this.app);

    //PixiBackend.initTextures();
  }
}

export default new App().app;
