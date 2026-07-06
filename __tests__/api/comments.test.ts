import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment first
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
process.env.NODE_ENV = 'test';

import { TestSetup } from '../setup/testSetup';
import { CommentModel } from '../../app/api/models/comment';
import { BlueprintModel } from '../../app/api/models/blueprint';
import { Types } from 'mongoose';

describe('Comments API', function () {
  let testData: any;
  let blueprintId: string;

  beforeEach(async function () {
    this.timeout(5000);
    testData = await TestSetup.beforeEach();
    blueprintId = testData.blueprints.popularBlueprint._id.toString();
  });

  afterEach(async function () {
    this.timeout(5000);
    delete process.env.COMMENT_COOLDOWN_SECONDS;
    await TestSetup.afterEach();
  });

  function post(token: string, body: string, parentId?: string | null) {
    return TestSetup.request()
      .post(`/api/blueprints/${blueprintId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send(parentId !== undefined ? { body, parentId } : { body });
  }

  // ─── POST /api/blueprints/:id/comments ───────────────────────────────────────

  describe('POST /api/blueprints/:id/comments', function () {
    it('returns 401 without a token', async function () {
      const response = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments`)
        .send({ body: 'hello' });
      expect(response.status).to.equal(401);
    });

    it('returns 404 for an unknown or deleted blueprint', async function () {
      const token = testData.users.user2.generateJwt();
      const unknown = await TestSetup.request()
        .post(`/api/blueprints/${new Types.ObjectId().toString()}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'hello' });
      expect(unknown.status).to.equal(404);

      await BlueprintModel.model.updateOne({ _id: blueprintId }, { deletedAt: new Date() });
      const deleted = await post(token, 'hello');
      expect(deleted.status).to.equal(404);
    });

    it('returns 400 for a missing or empty body', async function () {
      const token = testData.users.user2.generateJwt();
      expect((await post(token, '')).status).to.equal(400);
      const missing = await TestSetup.request()
        .post(`/api/blueprints/${blueprintId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(missing.status).to.equal(400);
    });

    it('returns 400 when the body sanitizes to nothing', async function () {
      const token = testData.users.user2.generateJwt();
      const response = await post(token, 'https://external.example.com/only-a-link');
      expect(response.status).to.equal(400);
    });

    it('returns 400 when the sanitized body exceeds 2000 characters', async function () {
      const token = testData.users.user2.generateJwt();
      const response = await post(token, 'x'.repeat(2001));
      expect(response.status).to.equal(400);
    });

    it('creates a top-level comment and returns its rendered form', async function () {
      const token = testData.users.user2.generateJwt();
      const response = await post(token, 'this breaks in <b>Spaced Out</b>, see https://evil.example.com');

      expect(response.status).to.equal(200);
      const comment = response.body.comment;
      expect(comment.parentId).to.equal(null);
      expect(comment.deleted).to.equal(false);
      expect(comment.author.username).to.equal(testData.users.user2.username);
      expect(comment.canDelete).to.equal(true);
      expect(comment.segments).to.deep.equal([
        { type: 'text', text: 'this breaks in Spaced Out, see' },
      ]);

      const stored = await CommentModel.model.findById(comment.id);
      expect(stored!.body).to.equal('this breaks in Spaced Out, see');
      expect(stored!.lastActivityAt.getTime()).to.equal(stored!.createdAt.getTime());
    });

    it('stores mentions and blueprint links as reference tokens and renders them resolved', async function () {
      const token = testData.users.user2.generateJwt();
      const otherBlueprintId = testData.blueprints.recentBlueprint._id.toString();
      const response = await post(
        token,
        `@${testData.users.user1.username} try /b/${otherBlueprintId} instead`
      );

      expect(response.status).to.equal(200);
      const stored = await CommentModel.model.findById(response.body.comment.id);
      expect(stored!.body).to.equal(
        `{{user:${testData.users.user1._id.toString()}}} try {{blueprint:${otherBlueprintId}}} instead`
      );
      expect(response.body.comment.segments).to.deep.equal([
        { type: 'user', id: testData.users.user1._id.toString(), name: testData.users.user1.username },
        { type: 'text', text: ' try ' },
        { type: 'blueprint', id: otherBlueprintId, name: 'Oxygen Production Line' },
        { type: 'text', text: ' instead' },
      ]);
    });

    it('creates a reply and bumps the parent lastActivityAt', async function () {
      const token1 = testData.users.user1.generateJwt();
      const token2 = testData.users.user2.generateJwt();
      const parent = (await post(token2, 'does this work on Terra?')).body.comment;

      const reply = await post(token1, 'yes, tested on cycle 200', parent.id);
      expect(reply.status).to.equal(200);
      expect(reply.body.comment.parentId).to.equal(parent.id);

      const storedParent = await CommentModel.model.findById(parent.id);
      const storedReply = await CommentModel.model.findById(reply.body.comment.id);
      expect(storedParent!.lastActivityAt.getTime()).to.equal(storedReply!.createdAt.getTime());
    });

    it('rejects replies to replies', async function () {
      const token = testData.users.user2.generateJwt();
      const parent = (await post(token, 'top level')).body.comment;
      const reply = (await post(token, 'a reply', parent.id)).body.comment;

      const grandchild = await post(token, 'reply to reply', reply.id);
      expect(grandchild.status).to.equal(400);
    });

    it('rejects replies to deleted parents and parents on other blueprints', async function () {
      const token = testData.users.user2.generateJwt();
      const parent = (await post(token, 'top level')).body.comment;
      await CommentModel.model.updateOne({ _id: parent.id }, { deletedAt: new Date() });
      expect((await post(token, 'too late', parent.id)).status).to.equal(404);

      const otherBlueprint = await CommentModel.model.create({
        blueprintId: testData.blueprints.recentBlueprint._id,
        authorId: testData.users.user1._id,
        parentId: null,
        body: 'on another blueprint',
      });
      const otherId = (otherBlueprint._id as Types.ObjectId).toString();
      expect((await post(token, 'cross-blueprint', otherId)).status).to.equal(404);
    });

    it('enforces the posting cooldown when configured', async function () {
      process.env.COMMENT_COOLDOWN_SECONDS = '60';
      const token = testData.users.user2.generateJwt();

      expect((await post(token, 'first comment')).status).to.equal(200);
      const second = await post(token, 'second comment too fast');
      expect(second.status).to.equal(429);

      // A different user is unaffected
      const otherToken = testData.users.user3.generateJwt();
      expect((await post(otherToken, 'different user')).status).to.equal(200);
    });
  });

  // ─── GET /api/blueprints/:id/comments ────────────────────────────────────────

  describe('GET /api/blueprints/:id/comments', function () {
    it('returns 404 for an unknown blueprint', async function () {
      const response = await TestSetup.request().get(
        `/api/blueprints/${new Types.ObjectId().toString()}/comments`
      );
      expect(response.status).to.equal(404);
    });

    it('returns an empty list for a blueprint without comments', async function () {
      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}/comments`);
      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal({ threads: [], total: 0 });
    });

    it('orders threads by most recent activity and replies chronologically', async function () {
      const token = testData.users.user2.generateJwt();
      const base = Date.now();
      const [commentA, commentB] = await CommentModel.model.create([
        {
          blueprintId,
          authorId: testData.users.user2._id,
          body: 'comment A',
          createdAt: new Date(base - 60000),
          lastActivityAt: new Date(base - 60000),
        },
        {
          blueprintId,
          authorId: testData.users.user2._id,
          body: 'comment B',
          createdAt: new Date(base - 30000),
          lastActivityAt: new Date(base - 30000),
        },
      ]);

      const idA = (commentA._id as Types.ObjectId).toString();
      const idB = (commentB._id as Types.ObjectId).toString();

      // Replying to the older comment A moves its thread to the top
      const reply = await post(token, 'reply to A', idA);
      expect(reply.status).to.equal(200);

      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}/comments`);
      expect(response.status).to.equal(200);
      expect(response.body.total).to.equal(3);
      expect(response.body.threads).to.have.lengthOf(2);
      expect(response.body.threads[0].comment.id).to.equal(idA);
      expect(response.body.threads[0].replies).to.have.lengthOf(1);
      expect(response.body.threads[1].comment.id).to.equal(idB);
      expect(response.body.threads[0].comment.canDelete).to.equal(false); // anonymous
    });

    it('hides deleted comments without replies and placeholders deleted ones with replies', async function () {
      const token = testData.users.user2.generateJwt();
      const lonely = (await post(token, 'deleted lonely comment')).body.comment;
      const parent = (await post(testData.users.user3.generateJwt(), 'deleted parent')).body.comment;
      const reply = (await post(token, 'still visible reply', parent.id)).body.comment;
      await CommentModel.model.updateMany(
        { _id: { $in: [lonely.id, parent.id] } },
        { deletedAt: new Date() }
      );

      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}/comments`);
      expect(response.body.threads).to.have.lengthOf(1);
      const thread = response.body.threads[0];
      expect(thread.comment.deleted).to.equal(true);
      expect(thread.comment.author).to.equal(null);
      expect(thread.comment.segments).to.deep.equal([]);
      expect(thread.replies[0].id).to.equal(reply.id);
      expect(response.body.total).to.equal(1); // only the visible reply
    });

    it('hides deleted replies entirely', async function () {
      const token = testData.users.user2.generateJwt();
      const parent = (await post(token, 'parent')).body.comment;
      const reply = (await post(testData.users.user3.generateJwt(), 'bad reply', parent.id)).body
        .comment;
      await CommentModel.model.updateOne({ _id: reply.id }, { deletedAt: new Date() });

      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}/comments`);
      expect(response.body.threads).to.have.lengthOf(1);
      expect(response.body.threads[0].replies).to.deep.equal([]);
    });

    it('computes canDelete for the author and the blueprint owner', async function () {
      const authorToken = testData.users.user2.generateJwt();
      await post(authorToken, 'my comment');

      const asAuthor = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`);
      expect(asAuthor.body.threads[0].comment.canDelete).to.equal(true);

      // user1 owns popularBlueprint — moderation right over all its comments
      const ownerToken = testData.users.user1.generateJwt();
      const asOwner = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}/comments`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(asOwner.body.threads[0].comment.canDelete).to.equal(true);

      const bystanderToken = testData.users.user3.generateJwt();
      const asBystander = await TestSetup.request()
        .get(`/api/blueprints/${blueprintId}/comments`)
        .set('Authorization', `Bearer ${bystanderToken}`);
      expect(asBystander.body.threads[0].comment.canDelete).to.equal(false);
    });

    it('renders references to since-deleted targets with a null name', async function () {
      const token = testData.users.user2.generateJwt();
      const otherBlueprintId = testData.blueprints.recentBlueprint._id.toString();
      await post(token, `try /b/${otherBlueprintId}`);
      await BlueprintModel.model.updateOne({ _id: otherBlueprintId }, { deletedAt: new Date() });

      const response = await TestSetup.request().get(`/api/blueprints/${blueprintId}/comments`);
      const segments = response.body.threads[0].comment.segments;
      expect(segments[1]).to.deep.equal({ type: 'blueprint', id: otherBlueprintId, name: null });
    });
  });

  // ─── DELETE /api/comments/:id ────────────────────────────────────────────────

  describe('DELETE /api/comments/:id', function () {
    it('returns 401 without a token and 404 for an unknown comment', async function () {
      expect((await TestSetup.request().delete(`/api/comments/${new Types.ObjectId()}`)).status).to.equal(401);

      const token = testData.users.user2.generateJwt();
      const response = await TestSetup.request()
        .delete(`/api/comments/${new Types.ObjectId()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).to.equal(404);
    });

    it('forbids deletion by unrelated users', async function () {
      const comment = (await post(testData.users.user2.generateJwt(), 'hands off')).body.comment;
      const response = await TestSetup.request()
        .delete(`/api/comments/${comment.id}`)
        .set('Authorization', `Bearer ${testData.users.user3.generateJwt()}`);
      expect(response.status).to.equal(403);

      const stored = await CommentModel.model.findById(comment.id);
      expect(stored!.deletedAt).to.equal(null);
    });

    it('lets the author soft-delete their own comment, idempotently', async function () {
      const token = testData.users.user2.generateJwt();
      const comment = (await post(token, 'regret')).body.comment;

      const first = await TestSetup.request()
        .delete(`/api/comments/${comment.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(first.status).to.equal(200);

      const stored = await CommentModel.model.findById(comment.id);
      expect(stored!.deletedAt).to.not.equal(null);

      const second = await TestSetup.request()
        .delete(`/api/comments/${comment.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(second.status).to.equal(200);
    });

    it('lets the blueprint owner delete comments on their blueprint', async function () {
      const comment = (await post(testData.users.user2.generateJwt(), 'spam-ish')).body.comment;
      const response = await TestSetup.request()
        .delete(`/api/comments/${comment.id}`)
        .set('Authorization', `Bearer ${testData.users.user1.generateJwt()}`);
      expect(response.status).to.equal(200);

      const stored = await CommentModel.model.findById(comment.id);
      expect(stored!.deletedAt).to.not.equal(null);
    });

    it('lets an admin delete any comment', async function () {
      const comment = (await post(testData.users.user2.generateJwt(), 'abuse')).body.comment;
      const adminToken = testData.users.user3.generateJwt('admin');
      const response = await TestSetup.request()
        .delete(`/api/comments/${comment.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).to.equal(200);
    });
  });
});
