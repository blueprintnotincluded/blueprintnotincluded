import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import mongoose, { Types } from 'mongoose';
import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { BlueprintVersionModel } from '../../app/api/models/blueprint-version';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const versionInitMigration = require('../../migrations/20260707000000_blueprint-version-init.js');

describe('Fork + BlueprintVersion API', function () {
  let testData: any;
  let popularId: string;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    popularId = testData.blueprints.popularBlueprint._id.toString();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  // ─── POST /api/blueprints/:id/fork ───────────────────────────────────────────

  describe('POST /api/blueprints/:id/fork', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request().post(`/api/blueprints/${popularId}/fork`);
      expect(response.status).to.equal(401);
    });

    it('returns 404 for an unknown or soft-deleted blueprint', async function () {
      const token = testData.users.user2.generateJwt();
      const unknown = await TestSetup.request()
        .post(`/api/blueprints/${new Types.ObjectId().toString()}/fork`)
        .set('Authorization', `Bearer ${token}`);
      expect(unknown.status).to.equal(404);

      await BlueprintModel.model.updateOne({ _id: popularId }, { deletedAt: new Date() });
      const deleted = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/fork`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleted.status).to.equal(404);
    });

    it('creates an independent Blueprint + BlueprintVersion, increments source forkCount, and records forkedFrom', async function () {
      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/fork`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).to.equal(200);
      const forkId = response.body.id;
      expect(forkId).to.be.a('string');

      const fork = await BlueprintModel.model.findById(forkId);
      expect(fork).to.not.equal(null);
      expect(fork!.owner.toString()).to.equal(testData.users.user2._id.toString());
      expect(fork!.name).to.equal('Super Coal Generator Setup fork');
      expect(fork!.currentVersionId).to.not.equal(null);
      expect(fork!.forkedFrom!.blueprintId.toString()).to.equal(popularId);
      expect(fork!.likes).to.deep.equal([testData.users.user2._id.toString()]);
      expect(fork!.likeCount).to.equal(1);

      const forkVersion = await BlueprintVersionModel.model.findById(fork!.currentVersionId);
      expect(forkVersion).to.not.equal(null);
      expect(forkVersion!.blueprintId.toString()).to.equal(forkId);
      expect(forkVersion!.data).to.deep.equal(testData.blueprints.popularBlueprint.data);

      const source = await BlueprintModel.model.findById(popularId);
      expect(source!.forkCount).to.equal(1);
      expect(fork!.forkedFrom!.versionId.toString()).to.equal(source!.currentVersionId!.toString());
    });

    it('leaves the fork loadable and unaffected after the parent is deleted', async function () {
      const token = testData.users.user2.generateJwt();
      const forkId = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/fork`)
          .set('Authorization', `Bearer ${token}`)
      ).body.id;

      const ownerToken = testData.users.user1.generateJwt();
      const deleteResponse = await TestSetup.request()
        .post('/api/deleteblueprint')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ blueprintId: popularId });
      expect(deleteResponse.status).to.equal(200);

      const getFork = await TestSetup.request().get(`/api/getblueprint/${forkId}`);
      expect(getFork.status).to.equal(200);
      expect(getFork.body.data).to.deep.equal(testData.blueprints.popularBlueprint.data);
    });
  });

  // ─── GET /api/blueprints/:id/versions ────────────────────────────────────────

  describe('GET /api/blueprints/:id/versions', function () {
    it('returns 404 for an unknown blueprint', async function () {
      const response = await TestSetup.request().get(
        `/api/blueprints/${new Types.ObjectId().toString()}/versions`
      );
      expect(response.status).to.equal(404);
    });

    it('returns an empty list for a blueprint with no explicit versions yet', async function () {
      const response = await TestSetup.request().get(`/api/blueprints/${popularId}/versions`);
      expect(response.status).to.equal(200);
      expect(response.body.versions).to.deep.equal([]);
    });

    it('lists versions newest first and excludes soft-deleted ones', async function () {
      const token = testData.users.user1.generateJwt();
      await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'first' });
      const second = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'second' });

      await TestSetup.request()
        .delete(`/api/blueprints/${popularId}/versions/${second.body.version.id}`)
        .set('Authorization', `Bearer ${token}`);

      const response = await TestSetup.request().get(`/api/blueprints/${popularId}/versions`);
      expect(response.status).to.equal(200);
      const names = response.body.versions.map((v: any) => v.name);
      expect(names).to.deep.equal(['first']);
    });
  });

  // ─── POST /api/blueprints/:id/versions ───────────────────────────────────────

  describe('POST /api/blueprints/:id/versions', function () {
    it('returns 401 without a token and 403 for a non-owner', async function () {
      const anon = await TestSetup.request().post(`/api/blueprints/${popularId}/versions`);
      expect(anon.status).to.equal(401);

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(403);
    });

    it('returns 404 for an unknown or soft-deleted blueprint', async function () {
      const token = testData.users.user1.generateJwt();
      const unknown = await TestSetup.request()
        .post(`/api/blueprints/${new Types.ObjectId().toString()}/versions`)
        .set('Authorization', `Bearer ${token}`);
      expect(unknown.status).to.equal(404);
    });

    it('returns 400 for an over-long name', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'x'.repeat(61) });
      expect(response.status).to.equal(400);
    });

    it('creates a named snapshot from the current data and becomes currentVersionId', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'stable' });

      expect(response.status).to.equal(200);
      expect(response.body.version.name).to.equal('stable');

      const blueprint = await BlueprintModel.model.findById(popularId);
      expect(blueprint!.currentVersionId!.toString()).to.equal(response.body.version.id);

      const version = await BlueprintVersionModel.model.findById(response.body.version.id);
      expect(version!.data).to.deep.equal(testData.blueprints.popularBlueprint.data);
    });
  });

  // ─── DELETE /api/blueprints/:id/versions/:versionId ──────────────────────────

  describe('DELETE /api/blueprints/:id/versions/:versionId', function () {
    it('returns 401 without a token and 403 for a non-owner', async function () {
      const ownerToken = testData.users.user1.generateJwt();
      const version = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/versions`)
          .set('Authorization', `Bearer ${ownerToken}`)
      ).body.version;

      const anon = await TestSetup.request().delete(
        `/api/blueprints/${popularId}/versions/${version.id}`
      );
      expect(anon.status).to.equal(401);

      const otherToken = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .delete(`/api/blueprints/${popularId}/versions/${version.id}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(response.status).to.equal(403);
    });

    it('returns 404 for an unknown version', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .delete(`/api/blueprints/${popularId}/versions/${new Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(404);
    });

    it('returns 400 for a malformed version id', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .delete(`/api/blueprints/${popularId}/versions/not-an-object-id`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(400);
    });

    it('advances currentVersionId to the next non-deleted version when the current one is deleted', async function () {
      const token = testData.users.user1.generateJwt();
      const first = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/versions`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'first' })
      ).body.version;
      const second = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/versions`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'second' })
      ).body.version;

      let blueprint = await BlueprintModel.model.findById(popularId);
      expect(blueprint!.currentVersionId!.toString()).to.equal(second.id);

      const deleteResponse = await TestSetup.request()
        .delete(`/api/blueprints/${popularId}/versions/${second.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteResponse.status).to.equal(200);

      blueprint = await BlueprintModel.model.findById(popularId);
      expect(blueprint!.currentVersionId!.toString()).to.equal(first.id);

      const deletedVersion = await BlueprintVersionModel.model.findById(second.id);
      expect(deletedVersion!.deletedAt).to.not.equal(null);
    });

    it('rejects deleting the only remaining version', async function () {
      const token = testData.users.user1.generateJwt();
      const only = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/versions`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'only' })
      ).body.version;

      const response = await TestSetup.request()
        .delete(`/api/blueprints/${popularId}/versions/${only.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(400);

      const version = await BlueprintVersionModel.model.findById(only.id);
      expect(version!.deletedAt).to.equal(null);
    });
  });

  // ─── POST /api/blueprints/:id/versions/:versionId/restore ────────────────────

  describe('POST /api/blueprints/:id/versions/:versionId/restore', function () {
    it('returns 401 without a token and 403 for a non-owner', async function () {
      const ownerToken = testData.users.user1.generateJwt();
      const version = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/versions`)
          .set('Authorization', `Bearer ${ownerToken}`)
      ).body.version;

      const anon = await TestSetup.request().post(
        `/api/blueprints/${popularId}/versions/${version.id}/restore`
      );
      expect(anon.status).to.equal(401);

      const otherToken = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions/${version.id}/restore`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(response.status).to.equal(403);
    });

    it('returns 404 for an unknown version', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions/${new Types.ObjectId().toString()}/restore`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(404);
    });

    it('returns 400 for a malformed version id', async function () {
      const token = testData.users.user1.generateJwt();
      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions/not-an-object-id/restore`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(400);
    });

    it('points currentVersionId back at an earlier live version without creating a new one', async function () {
      const token = testData.users.user1.generateJwt();
      const first = (
        await TestSetup.request()
          .post(`/api/blueprints/${popularId}/versions`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'first' })
      ).body.version;
      await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'second' });

      const countBefore = await BlueprintVersionModel.model.countDocuments({ blueprintId: popularId });

      const response = await TestSetup.request()
        .post(`/api/blueprints/${popularId}/versions/${first.id}/restore`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(200);
      expect(response.body.version.id).to.equal(first.id);

      const blueprint = await BlueprintModel.model.findById(popularId);
      expect(blueprint!.currentVersionId!.toString()).to.equal(first.id);

      const countAfter = await BlueprintVersionModel.model.countDocuments({ blueprintId: popularId });
      expect(countAfter).to.equal(countBefore);
    });
  });

  // ─── Migration 2a/2b idempotency ──────────────────────────────────────────────

  describe('migration 20260707000000_blueprint-version-init', function () {
    it('is idempotent and migrates isCopy/copyOf fork provenance', async function () {
      const db = mongoose.connection.db!;

      const blueprintCount = await BlueprintModel.model.countDocuments({});

      await versionInitMigration.up(db);
      const countAfterFirst = await BlueprintVersionModel.model.countDocuments({});
      expect(countAfterFirst).to.equal(blueprintCount); // one per seeded blueprint

      await versionInitMigration.up(db);
      const countAfterSecond = await BlueprintVersionModel.model.countDocuments({});
      expect(countAfterSecond).to.equal(countAfterFirst);

      const popular = await BlueprintModel.model.findById(popularId);
      expect(popular!.currentVersionId).to.not.equal(null);

      const copiedId = testData.blueprints.copiedBlueprint._id.toString();
      const copied = await BlueprintModel.model.findById(copiedId);
      expect(copied!.forkedFrom).to.not.equal(null);
      expect(copied!.forkedFrom!.blueprintId.toString()).to.equal(popularId);
      expect(copied!.forkedFrom!.versionId.toString()).to.equal(popular!.currentVersionId!.toString());
      expect(popular!.forkCount).to.equal(1);
    });

    it('reuses an orphaned version left by a crashed run instead of duplicating it', async function () {
      const db = mongoose.connection.db!;
      // Simulate a run that inserted the version but crashed before linking currentVersionId.
      const orphan = await db.collection('blueprintversions').insertOne({
        blueprintId: new Types.ObjectId(popularId),
        name: null,
        data: testData.blueprints.popularBlueprint.data,
        thumbnail: null,
        modVersion: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      await versionInitMigration.up(db);

      const versionCount = await BlueprintVersionModel.model.countDocuments({
        blueprintId: new Types.ObjectId(popularId),
      });
      expect(versionCount).to.equal(1);

      const popular = await BlueprintModel.model.findById(popularId);
      expect(popular!.currentVersionId!.toString()).to.equal(orphan.insertedId.toString());
    });

    it('backfills the parent forkCount exactly once across re-runs', async function () {
      await versionInitMigration.up(mongoose.connection.db!);
      await versionInitMigration.up(mongoose.connection.db!);
      await versionInitMigration.up(mongoose.connection.db!);

      const popular = await BlueprintModel.model.findById(popularId);
      expect(popular!.forkCount).to.equal(1);
    });

    it('down removes currentVersionId/forkedFrom, drops the versions collection, and reverts forkCount', async function () {
      const db = mongoose.connection.db!;
      await versionInitMigration.up(db);
      await versionInitMigration.down(db);

      const popular = await db.collection('blueprints').findOne({ _id: new Types.ObjectId(popularId) });
      expect(popular).to.not.have.property('currentVersionId');
      expect(popular).to.not.have.property('forkedFrom');
      expect(popular!.forkCount).to.equal(0);

      const versionCount = await BlueprintVersionModel.model.countDocuments({});
      expect(versionCount).to.equal(0);
    });
  });
});
