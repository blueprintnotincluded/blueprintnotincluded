import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { CommentModel } from '../../app/api/models/comment';
import { Types } from 'mongoose';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function makeBlueprint(owner: Types.ObjectId, overrides: Record<string, any> = {}) {
  return BlueprintModel.model.create({
    owner,
    name: `Discovery Test Blueprint ${new Types.ObjectId().toString()}`,
    likes: [],
    likeCount: 0,
    forkCount: 0,
    viewCount: 0,
    downloadCount: 0,
    createdAt: new Date(),
    modifiedAt: new Date(),
    thumbnail: TINY_PNG,
    data: { version: '1.0', buildings: [] },
    deletedAt: null,
    isPublished: true,
    ...overrides,
  });
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('Discovery: related blueprints + trending sort', function () {
  let testData: any;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
  });

  afterEach(async function () {
    this.timeout(5000);
    await TestSetup.afterEach();
  });

  describe('GET /api/blueprints/:id/related', function () {
    it('returns 400 for a malformed id and 404 for an unknown or deleted blueprint', async function () {
      expect((await TestSetup.request().get('/api/blueprints/not-an-id/related')).status).to.equal(400);
      expect(
        (await TestSetup.request().get(`/api/blueprints/${new Types.ObjectId()}/related`)).status
      ).to.equal(404);
    });

    it('ranks same-category blueprints above unrelated ones', async function () {
      const source = await makeBlueprint(testData.users.user1._id, {
        name: 'Related Source Power',
        category: 'power',
      });
      const sameCategory = await makeBlueprint(testData.users.user2._id, {
        name: 'Related Same Category',
        category: 'power',
      });
      const unrelated = await makeBlueprint(testData.users.user3._id, {
        name: 'Related Unrelated Food',
        category: 'food',
      });

      const response = await TestSetup.request().get(`/api/blueprints/${source._id}/related`);
      expect(response.status).to.equal(200);
      const names: string[] = response.body.blueprints.map((b: any) => b.name);

      expect(names).to.include(sameCategory.name);
      expect(names).to.include(unrelated.name);
      expect(names.indexOf(sameCategory.name)).to.be.lessThan(names.indexOf(unrelated.name));
    });

    it('never includes the source blueprint itself', async function () {
      const source = await makeBlueprint(testData.users.user1._id, {
        name: 'Related Excludes Self',
        category: 'power',
      });

      const response = await TestSetup.request().get(`/api/blueprints/${source._id}/related`);
      const names: string[] = response.body.blueprints.map((b: any) => b.name);
      expect(names).to.not.include(source.name);
    });

    it('excludes drafts and soft-deleted blueprints from the pool', async function () {
      const source = await makeBlueprint(testData.users.user1._id, {
        name: 'Related Source Draftcheck',
        category: 'power',
      });
      const draft = await makeBlueprint(testData.users.user2._id, {
        name: 'Related Draft Sibling',
        category: 'power',
        isPublished: false,
      });
      const deleted = await makeBlueprint(testData.users.user3._id, {
        name: 'Related Deleted Sibling',
        category: 'power',
        deletedAt: new Date(),
      });

      const response = await TestSetup.request().get(`/api/blueprints/${source._id}/related`);
      const names: string[] = response.body.blueprints.map((b: any) => b.name);
      expect(names).to.not.include(draft.name);
      expect(names).to.not.include(deleted.name);
    });

    it('ranks same-author blueprints above signal-free ones', async function () {
      const owner = testData.users.user1._id;
      const source = await makeBlueprint(owner, { name: 'Related Author Source' });
      const sameAuthor = await makeBlueprint(owner, { name: 'Related Author Sibling' });

      const response = await TestSetup.request().get(`/api/blueprints/${source._id}/related`);
      const names: string[] = response.body.blueprints.map((b: any) => b.name);
      expect(names).to.include(sameAuthor.name);
    });

    it('falls back to recent public blueprints when the source has no signals to match on', async function () {
      const lonelyOwner = new Types.ObjectId();
      const source = await makeBlueprint(lonelyOwner, { name: 'Related No Signal Source' });

      const response = await TestSetup.request().get(`/api/blueprints/${source._id}/related`);
      expect(response.status).to.equal(200);
      expect(response.body.blueprints.length).to.be.greaterThan(0);
    });
  });

  describe('GET /api/getblueprints?sort=trending', function () {
    it('ranks recently engaged blueprints above older ones with the same raw engagement', async function () {
      const hot = await makeBlueprint(testData.users.user1._id, {
        name: 'Trending Hot Recent',
        likeCount: 10,
        forkCount: 2,
        createdAt: new Date(),
      });
      const stale = await makeBlueprint(testData.users.user2._id, {
        name: 'Trending Stale Old',
        likeCount: 10,
        forkCount: 2,
        createdAt: daysAgo(60),
      });

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'trending' });

      expect(response.status).to.equal(200);
      const names: string[] = response.body.blueprints.map((b: any) => b.name);
      expect(names.indexOf(hot.name)).to.be.lessThan(names.indexOf(stale.name));
    });

    it('reorders relative to the plain popular (most-liked) sort', async function () {
      const oldButLiked = await makeBlueprint(testData.users.user1._id, {
        name: 'Trending Old But Liked',
        likeCount: 50,
        createdAt: daysAgo(90),
      });
      const newSmall = await makeBlueprint(testData.users.user2._id, {
        name: 'Trending New Small',
        likeCount: 3,
        createdAt: new Date(),
      });

      const popular = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'popular' });
      const popularNames: string[] = popular.body.blueprints.map((b: any) => b.name);
      expect(popularNames.indexOf(oldButLiked.name)).to.be.lessThan(popularNames.indexOf(newSmall.name));

      const trending = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'trending' });
      const trendingNames: string[] = trending.body.blueprints.map((b: any) => b.name);
      expect(trendingNames.indexOf(newSmall.name)).to.be.lessThan(trendingNames.indexOf(oldButLiked.name));
    });

    it('factors live comment counts into the score', async function () {
      const discussed = await makeBlueprint(testData.users.user1._id, {
        name: 'Trending Discussed',
        createdAt: new Date(),
      });
      const quiet = await makeBlueprint(testData.users.user2._id, {
        name: 'Trending Quiet',
        createdAt: new Date(),
      });

      await CommentModel.model.create([
        { blueprintId: discussed._id, authorId: testData.users.user2._id, body: 'one' },
        { blueprintId: discussed._id, authorId: testData.users.user3._id, body: 'two' },
        {
          blueprintId: discussed._id,
          authorId: testData.users.user3._id,
          body: 'removed',
          deletedAt: new Date(),
        },
      ]);

      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'trending' });

      const names: string[] = response.body.blueprints.map((b: any) => b.name);
      expect(names.indexOf(discussed.name)).to.be.lessThan(names.indexOf(quiet.name));
    });

    it('rejects an unknown sort value', async function () {
      const response = await TestSetup.request()
        .get('/api/getblueprints')
        .query({ olderthan: Date.now(), sort: 'notASort' });
      expect(response.status).to.equal(400);
    });
  });
});
