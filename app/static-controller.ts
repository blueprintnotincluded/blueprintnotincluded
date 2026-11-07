import path from 'path';
import { Request, Response } from 'express';
import { isbot } from 'isbot';

import { OpenGraphMeta, WebsiteMeta } from './websiteMeta';
import { BlueprintModel } from './api/models/blueprint';
import { UserModel } from './api/models/user';
import {
  describeSummary,
  summarizeStoredBlueprint,
  summaryCacheKey,
} from './api/services/blueprint-summary-service';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CollageFilter,
  collageMatch,
  collageQuery,
  collageUrl,
  getCollage,
  parseCollageFilter,
} from './api/services/social-card-service';

// `oxygenGen` -> "Oxygen gen"; category, subcategory and room ids are all
// camelCase, and the site shows no other labels for most of them.
const humanize = (id: string) => {
  const words = id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const LABEL_OVERRIDES: Record<string, string> = { oxygenGen: 'Oxygen' };
const label = (id: string) => LABEL_OVERRIDES[id] ?? humanize(id);

const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

// Cache-Control for a file express.static serves out of app/public, or null for
// the default (`max-age=0`, revalidated with the ETag on every visit — which is
// what everything got before, and what Cloudflare passes through uncached).
//
// Two kinds of file can be told apart by their path alone:
//   - Angular's hashed bundles (main-ABC12345.js, styles-….css, chunk-….js): the
//     name changes with the content, so the file never changes under its name.
//   - The game art under assets/: a thousand-odd icons that change only on an
//     `import:2024`, and a connection-sprite set of ~500. Before this, a visit
//     that opened the build menu re-requested every icon it showed and got a
//     304 back from the origin for each; a day's TTL turns those into cache hits
//     here and at the edge. The cost is that a redrawn icon can show stale for
//     up to a day after a deploy that changes it (new names are unaffected).
// The database zip is hashed too — frontend/scripts/build-database-zip.js names it
// after the JSON's SHA-256 and bakes that name into the bundle — so it joins the
// bundles at a year. The string map and index.html stay on the default: a cached
// stale file under a new bundle is not something to risk for one request.
const HASHED_BUNDLE = /[-.][0-9A-Za-z]{8,}\.(?:js|css|woff2?)$/;
const HASHED_DATABASE_ZIP = /\/assets\/database\/database-2024-[0-9a-f]{16}\.zip$/;
const LONG_LIVED_ASSET_DIRS = [
  'assets/ui_image/',
  'assets/ui_thumb/',
  'assets/connection_sprites/',
  'assets/images/',
  'assets/fonts/',
];
export const ONE_DAY_SECONDS = 86400;
export const ONE_YEAR_SECONDS = 31536000;

export function staticCacheControl(filePath: string): string | null {
  const relative = filePath.split(path.sep).join('/');
  if (LONG_LIVED_ASSET_DIRS.some((dir) => relative.includes('/' + dir)))
    return `public, max-age=${ONE_DAY_SECONDS}`;
  if (HASHED_BUNDLE.test(path.basename(relative)) && !relative.includes('/assets/'))
    return `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
  if (HASHED_DATABASE_ZIP.test(relative)) return `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
  return null;
}

const GENERIC_BLUEPRINT_DESCRIPTION = 'A blueprint for use in Oxygen Not Included.';

// The unfurl text: what the blueprint contains, in numbers, so a link pasted
// in Discord reads as a build and not as a bare title. Falls back to the
// generic line when the stored data cannot be summarized — the page must
// never fail over its own description.
export function blueprintDescription(
  data: unknown,
  id: string,
  modifiedAt: Date | null | undefined
): string {
  try {
    const summary = summarizeStoredBlueprint(data as any, summaryCacheKey(id, modifiedAt));
    const text = describeSummary(summary);
    return text.length > 0 ? `${text} · ${GENERIC_BLUEPRINT_DESCRIPTION}` : GENERIC_BLUEPRINT_DESCRIPTION;
  } catch (err) {
    console.log('blueprint description summary error');
    console.log(err);
    return GENERIC_BLUEPRINT_DESCRIPTION;
  }
}

export class StaticController {
  constructor() {
    this.getBlueprint = this.getBlueprint.bind(this);
    this.getHome = this.getHome.bind(this);
    this.getDiscover = this.getDiscover.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.getCollage = this.getCollage.bind(this);
    this.serveHtml = this.serveHtml.bind(this);
  }

  public getBlueprint(req: Request, res: Response) {
    const id = String(req.params.blueprintId);
    const blueprintUrl = `${process.env.HOST}${req.path}`;
    return BlueprintModel.model
      .findById(id)
      .select('name modifiedAt isPublished data')
      .then(blueprint => {
        if (!blueprint) return res.status(404).send();
        // Drafts: serve the SPA shell with generic meta — the owner's page
        // still renders (the API gates per-viewer), but crawlers/unfurlers
        // never see the draft's name or preview image.
        if (blueprint.isPublished === false) {
          this.serveHtml(req, res);
          return;
        }
        // Server-rendered OG image at the real unfurl size; versioned by
        // modifiedAt so crawlers re-fetch after edits.
        const version = blueprint.modifiedAt ? new Date(blueprint.modifiedAt).getTime() : 0;
        const ogImageUrl = `${process.env.HOST}/api/blueprints/${id}/preview/og.png?v=${version}`;
        const blueprintMeta = {
          'og:title': blueprint.name,
          'og:description': blueprintDescription(blueprint.data, id, blueprint.modifiedAt),
          'og:url': blueprintUrl,
          images: [
            {
              'og:image:url': ogImageUrl,
              'og:image': ogImageUrl,
              'og:image:alt': blueprint.name,
              'og:image:type': 'image/png',
              'og:image:width': '1200',
              'og:image:height': '630',
            },
          ],
        };
        const metaTags = new WebsiteMeta(blueprintMeta).getHtmlTags();
        this.serveHtml(req, res, { metaTags });
        return;
      });
  }

  public getBlueprintThumbnail(req: Request, res: Response) {
    let id = req.params.blueprintId;
    return BlueprintModel.model
      .findById(id)
      .then(blueprint => {
        // Anonymous crawler endpoint — drafts 404 (no viewer concept here)
        if (!blueprint || blueprint.isPublished === false) return res.status(404).send();
        var base64Data = blueprint.thumbnail.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        var img = Buffer.from(base64Data, 'base64');
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': img.length,
        });
        res.end(img);
        return;
      })
      .catch(err => {
        console.log('Blueprint find error');
        console.log(err);
        res.status(500).json({ getBlueprint: 'ERROR' });
      });
  }

  // Discover and profile pages unfurl with their own title and a collage of
  // their top blueprints. Humans get the SPA shell without touching the
  // database; only crawlers pay for the meta.
  public async getDiscover(req: Request, res: Response) {
    if (!isbot(req.get('user-agent'))) return this.serveHtml(req, res);
    try {
      const filter = parseCollageFilter(req.query as Record<string, unknown>) ?? {
        category: null,
        subcategory: null,
        rooms: null,
        owner: null,
      };
      const rawName = typeof req.query.name === 'string' ? req.query.name.trim().slice(0, 60) : '';

      // Title: "Generator · Power blueprints"; description: "Browse 12
      // generator power blueprints …".
      const parts: string[] = [];
      if (filter.subcategory) parts.push(label(filter.subcategory));
      if (filter.category) parts.push(label(filter.category));
      else if (filter.rooms?.length === 1) parts.push(label(filter.rooms[0]));

      let title: string;
      let description: string;
      let images: OpenGraphMeta['images'] | undefined;
      if (rawName) {
        // Search results are ranked by the search service, which this path
        // doesn't run; the site image beats a collage of the wrong builds.
        title = `Blueprints matching “${rawName}”`;
        description = `Search results for “${rawName}” — Oxygen Not Included blueprints.`;
      } else {
        const count = await BlueprintModel.model.countDocuments(collageMatch(filter));
        const subject = parts.length > 0 ? parts.join(' ').toLowerCase() : 'community';
        title = parts.length > 0 ? `${parts.join(' · ')} blueprints` : 'Discover blueprints';
        description = `Browse ${plural(count, `${subject} blueprint`)} for Oxygen Not Included.`;
        images = count > 0 ? [this.collageImage(filter, title)] : undefined;
      }
      const meta: Partial<OpenGraphMeta> = {
        'og:title': title,
        'og:description': description,
        'og:url': this.discoverUrl(filter, rawName),
      };
      if (images) meta.images = images;
      return this.serveHtml(req, res, { metaTags: new WebsiteMeta(meta).getHtmlTags() });
    } catch (err) {
      console.log('Discover meta error', err);
      return this.serveHtml(req, res);
    }
  }

  public async getProfile(req: Request, res: Response) {
    if (!isbot(req.get('user-agent'))) return this.serveHtml(req, res);
    try {
      const user = await UserModel.model
        .findOne({ username: req.params.username })
        .select('_id username')
        .lean();
      if (!user?.username) return this.serveHtml(req, res);
      const filter: CollageFilter = {
        category: null,
        subcategory: null,
        rooms: null,
        owner: String(user._id),
      };
      const count = await BlueprintModel.model.countDocuments(collageMatch(filter));
      const title = `${user.username}'s blueprints`;
      const meta: Partial<OpenGraphMeta> = {
        'og:type': 'profile',
        'og:title': title,
        'og:description': `${plural(count, 'blueprint')} by ${user.username} for Oxygen Not Included.`,
        'og:url': `${process.env.HOST}${req.path}`,
      };
      if (count > 0) meta.images = [this.collageImage(filter, title)];
      return this.serveHtml(req, res, { metaTags: new WebsiteMeta(meta).getHtmlTags() });
    } catch (err) {
      console.log('Profile meta error', err);
      return this.serveHtml(req, res);
    }
  }

  public async getCollage(req: Request, res: Response) {
    const filter = parseCollageFilter(req.query as Record<string, unknown>);
    if (filter == null) return res.status(400).send();
    try {
      const buffer = await getCollage(filter);
      // The url carries a daily `v`, so a day's caching is never stale for long.
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
      return res.send(buffer);
    } catch (err) {
      console.log('Collage error', err);
      return res.status(500).send();
    }
  }

  // Canonical: only the params the title and card describe, so a link carrying
  // sort, utm_* or junk groups with the plain filter link in unfurlers.
  private discoverUrl(filter: CollageFilter, name: string) {
    const params = new URLSearchParams(collageQuery({ ...filter, owner: null }));
    if (name) params.set('name', name);
    const query = params.toString();
    return `${process.env.HOST}/discover${query ? `?${query}` : ''}`;
  }

  private collageImage(filter: CollageFilter, title: string) {
    const url = collageUrl(filter);
    return {
      'og:image:url': url,
      'og:image': url,
      'og:image:alt': `A collage of ${title.charAt(0).toLowerCase()}${title.slice(1)}.`,
      'og:image:type': 'image/jpeg',
      'og:image:width': String(CARD_WIDTH),
      'og:image:height': String(CARD_HEIGHT),
    };
  }

  public getHome(req: Request, res: Response) {
    const metaTags = new WebsiteMeta().getHtmlTags();
    this.serveHtml(req, res, { metaTags });
  }

  public serveHtml(req: Request, res: Response, locals?: any) {
    if (!locals || typeof locals === 'function' || !locals.metaTags) {
      // og:url is the canonical id unfurlers group shares under; pointing
      // every page at the homepage made /mods or /about unfurl as the home page.
      locals = {
        metaTags: new WebsiteMeta({ 'og:url': `${process.env.HOST}${req.path}` }).getHtmlTags(),
      };
    }
    if (isbot(req.get('user-agent'))) {
      res.render('index-robots', locals);
    } else {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  }
}
