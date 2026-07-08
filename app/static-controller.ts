import path from 'path';
import { Request, Response } from 'express';
import isbot from 'isbot';

import { WebsiteMeta } from './websiteMeta';
import { BlueprintModel } from './api/models/blueprint';
export class StaticController {
  constructor() {
    this.getBlueprint = this.getBlueprint.bind(this);
    this.getHome = this.getHome.bind(this);
    this.serveHtml = this.serveHtml.bind(this);
  }

  public getBlueprint(req: Request, res: Response) {
    const id = req.params.blueprintId;
    const blueprintUrl = `${process.env.HOST}${req.path}`;
    return BlueprintModel.model
      .findById(id)
      .select('name modifiedAt')
      .then(blueprint => {
        if (!blueprint) return res.status(404).send();
        // Server-rendered OG image at the real unfurl size; versioned by
        // modifiedAt so crawlers re-fetch after edits.
        const version = blueprint.modifiedAt ? new Date(blueprint.modifiedAt).getTime() : 0;
        const ogImageUrl = `${process.env.HOST}/api/blueprints/${id}/preview/og.png?v=${version}`;
        const blueprintMeta = {
          'og:title': blueprint.name,
          'og:description': 'A blueprint for use in Oxygen Not Included.',
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
        const metaTags =
          new WebsiteMeta(blueprintMeta).getHtmlTags() +
          '<meta name="twitter:card" content="summary_large_image" />' +
          `<meta name="twitter:image" content="${ogImageUrl}" />`;
        this.serveHtml(req, res, { metaTags });
        return;
      });
  }

  public getBlueprintThumbnail(req: Request, res: Response) {
    let id = req.params.blueprintId;
    return BlueprintModel.model
      .findById(id)
      .then(blueprint => {
        if (!blueprint) return res.status(404).send();
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

  public getHome(req: Request, res: Response) {
    const metaTags = new WebsiteMeta().getHtmlTags();
    this.serveHtml(req, res, { metaTags });
  }

  public serveHtml(req: Request, res: Response, locals?: any) {
    if (!locals || typeof locals === 'function' || !locals.metaTags) {
      locals = { metaTags: new WebsiteMeta().getHtmlTags() };
    }
    if (isbot(req.get('user-agent'))) {
      res.render('index-robots', locals);
    } else {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  }
}
