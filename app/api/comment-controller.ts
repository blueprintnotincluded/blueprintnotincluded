import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { CommentModel, Comment } from './models/comment';
import { BlueprintModel } from './models/blueprint';
import { UserModel, UserJwt } from './models/user';
import { apiError } from './utils/apiError';
import { optionalViewer } from './utils/optionalViewer';
import {
  sanitizeCommentBody,
  extractTokenIds,
  segmentBody,
  toEditableText,
} from './services/comment-body';
import {
  CommentDto,
  CommentThread,
  ListCommentsResponse,
  PostCommentRequest,
  EditCommentRequest,
  COMMENT_MAX_LENGTH,
} from '../../lib/index';

// Guards regex work on pathological input; well over the stored cap
const MAX_RAW_BODY_LENGTH = 20000;
// Comments per blueprint returned in one response; no pagination at launch —
// real blueprints see orders of magnitude fewer comments than this
const MAX_COMMENTS_PER_BLUEPRINT = 1000;

// Cloudflare handles real rate limiting; this is just a per-user posting
// cooldown to blunt copy-paste spam. Off in tests unless explicitly set.
function cooldownSeconds(): number {
  if (process.env.COMMENT_COOLDOWN_SECONDS != null) {
    return parseInt(process.env.COMMENT_COOLDOWN_SECONDS, 10) || 0;
  }
  return process.env.NODE_ENV === 'test' ? 0 : 10;
}

async function resolveMentions(usernames: string[]): Promise<Map<string, string>> {
  const users = await UserModel.model
    .find({ username: { $in: usernames.map(u => new RegExp(`^${u}$`, 'i')) } })
    .select('username')
    .lean();
  const map = new Map<string, string>();
  for (const user of users) {
    map.set((user.username as string).toLowerCase(), user._id.toString());
  }
  return map;
}

interface RenderContext {
  authors: Map<string, string>; // authorId -> username
  blueprints: Map<string, string>; // referenced blueprintId -> name
  users: Map<string, string>; // referenced userId -> username
  blueprintOwnerId: string;
  viewer: UserJwt | null;
}

async function buildRenderContext(
  comments: Comment[],
  blueprintOwnerId: string,
  viewer: UserJwt | null
): Promise<RenderContext> {
  const visibleBodies = comments.filter(c => c.deletedAt == null).map(c => c.body);
  const { blueprintIds, userIds } = extractTokenIds(visibleBodies);
  const authorIds = [...new Set(comments.map(c => c.authorId.toString()))];

  const [authorDocs, blueprintDocs, userDocs] = await Promise.all([
    UserModel.model.find({ _id: { $in: authorIds } }).select('username').lean(),
    blueprintIds.length > 0
      ? BlueprintModel.model.find({ _id: { $in: blueprintIds }, deletedAt: null }).select('name').lean()
      : Promise.resolve([]),
    userIds.length > 0
      ? UserModel.model.find({ _id: { $in: userIds } }).select('username').lean()
      : Promise.resolve([]),
  ]);

  return {
    authors: new Map(authorDocs.map(u => [u._id.toString(), u.username as string])),
    blueprints: new Map(blueprintDocs.map(b => [b._id.toString(), b.name as string])),
    users: new Map(userDocs.map(u => [u._id.toString(), u.username as string])),
    blueprintOwnerId,
    viewer,
  };
}

function toDto(comment: Comment, context: RenderContext): CommentDto {
  const deleted = comment.deletedAt != null;
  const authorId = comment.authorId.toString();
  const username = context.authors.get(authorId);
  const viewerId = context.viewer?._id;
  const canDelete =
    !deleted &&
    viewerId != null &&
    (viewerId === authorId || viewerId === context.blueprintOwnerId || context.viewer?.role === 'admin');
  // Editing is author-only: moderation (owner/admin) removes, it never rewrites
  const canEdit = !deleted && viewerId != null && viewerId === authorId;

  return {
    id: (comment._id as mongoose.Types.ObjectId).toString(),
    parentId: comment.parentId != null ? comment.parentId.toString() : null,
    author: deleted || username == null ? null : { id: authorId, username },
    segments: deleted
      ? []
      : segmentBody(comment.body, { blueprints: context.blueprints, users: context.users }),
    deleted,
    createdAt: comment.createdAt.toISOString(),
    lastActivityAt: comment.lastActivityAt.toISOString(),
    editedAt: comment.editedAt != null ? comment.editedAt.toISOString() : null,
    canDelete,
    canEdit,
    ...(canEdit ? { editSource: toEditableText(comment.body, context.users) } : {}),
  };
}

export class CommentController {
  constructor() {
    this.list = this.list.bind(this);
    this.create = this.create.bind(this);
    this.edit = this.edit.bind(this);
    this.remove = this.remove.bind(this);
  }

  public async list(req: Request, res: Response): Promise<void> {
    try {
      const blueprintId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner')
        .lean();
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const comments = await CommentModel.model
        .find({ blueprintId })
        .sort({ createdAt: 1 })
        .limit(MAX_COMMENTS_PER_BLUEPRINT)
        .lean<Comment[]>();

      const repliesByParent = new Map<string, Comment[]>();
      for (const comment of comments) {
        if (comment.parentId == null || comment.deletedAt != null) continue;
        const key = comment.parentId.toString();
        const bucket = repliesByParent.get(key);
        if (bucket) bucket.push(comment);
        else repliesByParent.set(key, [comment]);
      }

      // Visible top-level: not deleted, or deleted-with-visible-replies
      // (rendered as "[comment removed]" to preserve thread continuity)
      const topLevel = comments
        .filter(c => c.parentId == null)
        .filter(c => c.deletedAt == null || repliesByParent.has((c._id as mongoose.Types.ObjectId).toString()))
        .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

      const visible = [...topLevel, ...topLevel.flatMap(c => repliesByParent.get((c._id as mongoose.Types.ObjectId).toString()) ?? [])];
      const context = await buildRenderContext(visible, blueprint.owner.toString(), optionalViewer(req));

      const threads: CommentThread[] = topLevel.map(comment => ({
        comment: toDto(comment, context),
        replies: (repliesByParent.get((comment._id as mongoose.Types.ObjectId).toString()) ?? []).map(reply =>
          toDto(reply, context)
        ),
      }));

      const response: ListCommentsResponse = {
        threads,
        total: visible.filter(c => c.deletedAt == null).length,
      };
      res.json(response);
    } catch (err) {
      console.log('comment list error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve comments'));
    }
  }

  public async create(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const blueprintId = req.params.id;
      const { body, parentId } = req.body as PostCommentRequest;

      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }
      if (typeof body !== 'string' || body.length === 0 || body.length > MAX_RAW_BODY_LENGTH) {
        res.status(400).json(apiError(400, 'Comment body is required'));
        return;
      }
      if (parentId != null && (typeof parentId !== 'string' || !mongoose.Types.ObjectId.isValid(parentId))) {
        res.status(400).json(apiError(400, 'Invalid parentId'));
        return;
      }

      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner')
        .lean();
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      let parent: Comment | null = null;
      if (parentId != null) {
        parent = await CommentModel.model.findOne({ _id: parentId, deletedAt: null });
        if (!parent || parent.blueprintId.toString() !== blueprintId) {
          res.status(404).json(apiError(404, 'Parent comment not found'));
          return;
        }
        // Two levels only: replies to replies are rejected at the API layer
        if (parent.parentId != null) {
          res.status(400).json(apiError(400, 'Cannot reply to a reply'));
          return;
        }
      }

      const cooldown = cooldownSeconds();
      if (cooldown > 0) {
        const recent = await CommentModel.model.exists({
          authorId: user._id,
          createdAt: { $gt: new Date(Date.now() - cooldown * 1000) },
        });
        if (recent) {
          res.status(429).json(apiError(429, 'You are commenting too quickly — try again shortly'));
          return;
        }
      }

      const sanitized = await sanitizeCommentBody(body, resolveMentions);
      if (sanitized.length === 0) {
        res.status(400).json(apiError(400, 'Comment is empty after removing disallowed content'));
        return;
      }
      if (sanitized.length > COMMENT_MAX_LENGTH) {
        res.status(400).json(apiError(400, `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer`));
        return;
      }

      const now = new Date();
      const comment = await CommentModel.model.create({
        blueprintId,
        authorId: user._id,
        parentId: parentId ?? null,
        body: sanitized,
        createdAt: now,
        lastActivityAt: now,
      });

      if (parent != null) {
        // Active threads surface first in the feed
        await CommentModel.model.updateOne({ _id: parent._id }, { $max: { lastActivityAt: now } });
      }

      const context = await buildRenderContext([comment], blueprint.owner.toString(), user);
      res.json({ comment: toDto(comment, context) });
    } catch (err) {
      console.log('comment create error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to post comment'));
    }
  }

  // True edits: the body is replaced through the same parse pipeline as
  // creation and only editedAt records that a change happened — no history
  // is kept. Author-only; no time window.
  public async edit(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const commentId = req.params.id;
      const { body } = req.body as EditCommentRequest;

      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        res.status(400).json(apiError(400, 'Invalid comment id'));
        return;
      }
      if (typeof body !== 'string' || body.length === 0 || body.length > MAX_RAW_BODY_LENGTH) {
        res.status(400).json(apiError(400, 'Comment body is required'));
        return;
      }

      const comment = await CommentModel.model.findOne({ _id: commentId, deletedAt: null });
      if (!comment) {
        res.status(404).json(apiError(404, 'Comment not found'));
        return;
      }
      if (comment.authorId.toString() !== user._id) {
        res.status(403).json(apiError(403, 'Only the author can edit a comment'));
        return;
      }

      const blueprint = await BlueprintModel.model
        .findOne({ _id: comment.blueprintId, deletedAt: null })
        .select('owner')
        .lean();
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const sanitized = await sanitizeCommentBody(body, resolveMentions);
      if (sanitized.length === 0) {
        res.status(400).json(apiError(400, 'Comment is empty after removing disallowed content'));
        return;
      }
      if (sanitized.length > COMMENT_MAX_LENGTH) {
        res.status(400).json(apiError(400, `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer`));
        return;
      }

      comment.body = sanitized;
      comment.editedAt = new Date();
      await comment.save();

      const context = await buildRenderContext([comment], blueprint.owner.toString(), user);
      res.json({ comment: toDto(comment, context) });
    } catch (err) {
      console.log('comment edit error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to edit comment'));
    }
  }

  public async remove(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const commentId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        res.status(400).json(apiError(400, 'Invalid comment id'));
        return;
      }

      const comment = await CommentModel.model.findById(commentId);
      if (!comment) {
        res.status(404).json(apiError(404, 'Comment not found'));
        return;
      }

      const blueprint = await BlueprintModel.model.findById(comment.blueprintId).select('owner').lean();
      const isAuthor = comment.authorId.toString() === user._id;
      const isBlueprintOwner = blueprint != null && blueprint.owner.toString() === user._id;
      const isAdmin = user.role === 'admin';
      if (!isAuthor && !isBlueprintOwner && !isAdmin) {
        res.status(403).json(apiError(403, 'Not allowed to delete this comment'));
        return;
      }

      if (comment.deletedAt != null) {
        res.json({ delete: 'OK' });
        return;
      }

      comment.deletedAt = new Date();
      await comment.save();
      res.json({ delete: 'OK' });
    } catch (err) {
      console.log('comment delete error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to delete comment'));
    }
  }
}
