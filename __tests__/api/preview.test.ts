import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import sharp from 'sharp';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { PreviewImageService } from '../../app/api/services/preview-image-service';
import { Types } from 'mongoose';

describe('Blueprint preview images', function () {
  let testData: any;
  let blueprintId: string;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    blueprintId = testData.blueprints.popularBlueprint._id.toString();
  });

  afterEach(async function () {
    this.timeout(5000);
    PreviewImageService.setInstance(null);
    await TestSetup.afterEach();
  });

  describe('GET /api/blueprints/:id/preview/:variant', function () {
    it('rejects malformed ids, unknown variants, and missing blueprints', async function () {
      expect(
        (await TestSetup.request().get('/api/blueprints/not-an-id/preview/card.webp')).status
      ).to.equal(400);
      expect(
        (await TestSetup.request().get(`/api/blueprints/${blueprintId}/preview/nope.gif`)).status
      ).to.equal(404);
      expect(
        (
          await TestSetup.request().get(
            `/api/blueprints/${new Types.ObjectId()}/preview/card.webp`
          )
        ).status
      ).to.equal(404);
    });

    it('returns 404 for soft-deleted blueprints', async function () {
      await BlueprintModel.model.updateOne({ _id: blueprintId }, { deletedAt: new Date() });
      const response = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp`
      );
      expect(response.status).to.equal(404);
    });

    it('falls back to the legacy stored thumbnail when rendering is disabled', async function () {
      // NODE_ENV=test disables the render worker, so the endpoint must serve
      // the client-generated thumbnail stored on the document.
      const response = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp`
      );
      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/image\/png/);
      expect(response.headers['etag']).to.contain(blueprintId);
      expect(response.body.length).to.be.greaterThan(0);
    });

    it('serves 304 when the ETag matches', async function () {
      const first = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp`
      );
      const response = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}/preview/card.webp`)
        .set('If-None-Match', first.headers['etag']);
      expect(response.status).to.equal(304);
    });

    it('marks versioned urls immutable and bare urls revalidatable', async function () {
      const versioned = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp?v=123`
      );
      expect(versioned.headers['cache-control']).to.equal('public, max-age=31536000, immutable');

      const bare = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp`
      );
      expect(bare.headers['cache-control']).to.equal('public, max-age=300');
    });

    it('serves rendered variants and re-renders when the blueprint is modified', async function () {
      this.timeout(10000);
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-test-'));
      let renderCount = 0;
      const fakeMaster = await sharp({
        create: { width: 64, height: 64, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } },
      })
        .png()
        .toBuffer();
      PreviewImageService.setInstance(
        new PreviewImageService({
          cacheDir,
          disabled: false,
          renderMasterFn: async () => {
            renderCount++;
            return fakeMaster;
          },
        })
      );

      const card = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp`
      );
      expect(card.status).to.equal(200);
      expect(card.headers['content-type']).to.match(/image\/webp/);
      expect(renderCount).to.equal(1);

      // Every variant comes from the single master render.
      const og = await TestSetup.request().get(`/api/blueprints/${blueprintId}/preview/og.png`);
      expect(og.status).to.equal(200);
      expect(og.headers['content-type']).to.match(/image\/png/);
      const ogMeta = await sharp(og.body).metadata();
      expect(ogMeta.width).to.equal(1200);
      expect(ogMeta.height).to.equal(630);
      expect(renderCount).to.equal(1);

      // Cached files are stale once the blueprint is modified again.
      await BlueprintModel.model.updateOne(
        { _id: blueprintId },
        { modifiedAt: new Date(Date.now() + 60_000) }
      );
      const rerendered = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/hero.webp`
      );
      expect(rerendered.status).to.equal(200);
      expect(renderCount).to.equal(2);

      fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    it('renders one master at a time even when requests arrive together', async function () {
      this.timeout(10000);
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-queue-'));
      const fakeMaster = await sharp({
        create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();
      let active = 0;
      let maxActive = 0;
      const service = new PreviewImageService({
        cacheDir,
        disabled: false,
        renderMasterFn: async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise(resolve => setTimeout(resolve, 20));
          active--;
          return fakeMaster;
        },
      });

      const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
      const results = await Promise.all(
        ids.map(id =>
          service.getVariant(id.toString(), null, 'card.webp', async () => ({ items: [] }))
        )
      );

      results.forEach(result => expect(result).to.not.be.null);
      expect(maxActive).to.equal(1);
      fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    it('fails fast (fallback, not hang) when the render queue is full', async function () {
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-queue-'));
      const fakeMaster = await sharp({
        create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();
      let releaseFirst!: () => void;
      const firstStarted = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      const service = new PreviewImageService({
        cacheDir,
        disabled: false,
        renderQueueMax: 1,
        renderMasterFn: async () => {
          await firstStarted;
          return fakeMaster;
        },
      });
      const loadMdb = async () => ({ items: [] });

      const first = service.getVariant(
        new Types.ObjectId().toString(),
        null,
        'card.webp',
        loadMdb
      );
      await new Promise(resolve => setImmediate(resolve));

      // Queue holds one render (the active one); the next request is shed
      // immediately so the controller serves the legacy thumbnail.
      const second = await service.getVariant(
        new Types.ObjectId().toString(),
        null,
        'card.webp',
        loadMdb
      );
      expect(second).to.be.null;

      releaseFirst();
      expect(await first).to.not.be.null;
      fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    it('falls back to the legacy thumbnail when the renderer fails', async function () {
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-test-'));
      PreviewImageService.setInstance(
        new PreviewImageService({
          cacheDir,
          disabled: false,
          renderMasterFn: async () => {
            throw new Error('worker exploded');
          },
        })
      );

      const response = await TestSetup.request().get(
        `/api/blueprints/${blueprintId}/preview/card.webp`
      );
      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/image\/png/);

      fs.rmSync(cacheDir, { recursive: true, force: true });
    });
  });
});
