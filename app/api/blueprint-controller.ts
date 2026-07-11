import { Request, Response } from 'express';
import { BlueprintModel, Blueprint } from './models/blueprint';
import {
  MdbBlueprint,
  BlueprintResponse,
//   BlueprintListItem,
  BlueprintListResponse,
  BlueprintLike,
//   Vector2,
//   CameraService,
//   Overlay,
//   ImageSource,
  BlueprintDelete,
  GAME_VERSIONS,
  CATEGORIES,
  SUBCATEGORIES,
  RESEARCH_TIERS,
} from '../../lib/index';
import { Blueprint as sharedBlueprint, BlueprintDetailsResponse } from '../../lib/index';
import { UserModel, UserJwt } from './models/user';
import { CommentModel } from './models/comment';
import { NotificationController } from './notification-controller';
import { BatchUtils } from './batch/batch-utils';
import { apiError } from './utils/apiError';
import { parseOlderThan } from './utils/pagination';
import { optionalViewer } from './utils/optionalViewer';
import { canViewBlueprint } from './utils/blueprint-visibility';
import { BlueprintEventService } from './services/blueprint-event-service';
import { BlueprintCounterService, CounterKind } from './services/blueprint-counter-service';
import { resolveCurrentData, syncCurrentVersion } from './services/blueprint-version-service';
import { PreviewImageService } from './services/preview-image-service';
import mongoose from 'mongoose';

const MAX_SKIP = 10000;

const SORTS = ['recent', 'popular', 'mostForked', 'mostViewed', 'mostDownloaded'] as const;
type BlueprintSort = (typeof SORTS)[number];

export class BlueprintController {
  public uploadBlueprint(req: Request, res: Response) {
    console.log('uploadBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO input checks here

      let user = req.user as UserJwt;
      let ownerId = user._id;
      let name = req.body.name;
      let data = req.body.blueprint;
      let thumbnail = req.body.thumbnail;
      let overwrite = req.body.overwrite;

      if (!name) {
        res.status(400).json(apiError(400, 'Blueprint name is required'));
        return;
      }

      let regexp = /^[a-zA-Z0-9-_ ]+$/;
      if (name.search(regexp) == -1 || name.length > 60) {
        console.log('Blueprint name too long or with weird characters');
        res.status(400).json(apiError(400, 'Blueprint name must be 1–60 alphanumeric characters (hyphens, underscores, and spaces allowed)'));
        return;
      }

      const gameVersion = req.body.gameVersion ?? null;
      if (gameVersion != null && !(GAME_VERSIONS as readonly string[]).includes(gameVersion)) {
        res.status(400).json(apiError(400, `Invalid gameVersion: must be one of ${GAME_VERSIONS.join(', ')}`));
        return;
      }

      const category = req.body.category ?? null;
      if (category != null && !(CATEGORIES as readonly string[]).includes(category)) {
        res.status(400).json(apiError(400, `Invalid category: must be one of ${CATEGORIES.join(', ')}`));
        return;
      }

      const subcategory = req.body.subcategory ?? null;
      if (subcategory != null) {
        if (category == null) {
          res.status(400).json(apiError(400, 'subcategory requires category to be set'));
          return;
        }
        const allowed = SUBCATEGORIES[category as keyof typeof SUBCATEGORIES];
        if (!allowed || !allowed.includes(subcategory)) {
          res.status(400).json(apiError(400, `Invalid subcategory for category '${category}'`));
          return;
        }
      }

      const researchTier = req.body.researchTier ?? null;
      if (researchTier != null && !(RESEARCH_TIERS as readonly string[]).includes(researchTier)) {
        res.status(400).json(apiError(400, `Invalid researchTier: must be one of ${RESEARCH_TIERS.join(', ')}`));
        return;
      }

      const description = req.body.description ?? null;
      if (description != null && description.length > 500) {
        res.status(400).json(apiError(400, 'description must be 500 characters or fewer'));
        return;
      }

      const modded = req.body.modded != null ? Boolean(req.body.modded) : null;

      // publish: true = publish as part of this save; absent = keep current
      // state (new blueprints start as drafts via the schema default)
      const publish = req.body.publish != null ? Boolean(req.body.publish) : null;

      const metadata = { gameVersion, category, subcategory, description, researchTier, modded };

      BlueprintModel.model
        .find({ owner: ownerId, name: name })
        .then(blueprints => {
          if (blueprints.length > 0) {
            if (overwrite || blueprints[0].deletedAt != null)
              BlueprintController.saveBlueprint(
                req,
                res,
                blueprints[0],
                ownerId,
                name,
                data,
                thumbnail,
                false,
                metadata,
                publish
              );
            else res.json({ overwrite: true });
          } else {
            let blueprint = new BlueprintModel.model();
            // Every blueprint starts with the author's like (GitHub-star semantics)
            blueprint.likes = [ownerId];
            blueprint.likeCount = 1;
            BlueprintController.saveBlueprint(
              req,
              res,
              blueprint,
              ownerId,
              name,
              data,
              thumbnail,
              true,
              metadata,
              publish
            );
          }
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json(apiError(500, 'Failed to save blueprint'));
        });
    }
  }

  public deleteBlueprint(req: Request, res: Response) {
    console.log('deleteBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      try {
        let user = req.user as UserJwt;
        let blueprintDelete = req.body as BlueprintDelete;

        let ownerId = user._id;

        if (blueprintDelete.blueprintId == null || user == null) {
          res.status(400).json(apiError(400, 'Missing blueprintId'));
          return;
        }

        BlueprintModel.model
          .find({ _id: blueprintDelete.blueprintId, owner: ownerId })
          .then(blueprints => {
            if (blueprints.length > 0) {
              let blueprint = blueprints[0];

              blueprint.deletedAt = new Date();

              blueprint
                .save()
                .then(() => {
                  res.json({ deleteBlueprint: 'OK' });
                  BlueprintEventService.log({
                    blueprintId: blueprint.id,
                    actorId: ownerId,
                    type: 'deleted',
                  });
                })
                .catch(error => {
                  console.log('deleteBlueprint error');
                  console.log(error);
                  res.status(500).json(apiError(500, 'Failed to delete blueprint'));
                });
            } else res.status(403).json(apiError(403, 'Blueprint not found or not owned by user'));
          })
          .catch(err => {
            console.log('deleteBlueprint error');
            console.log(err);
            res.status(500).json(apiError(500, 'Failed to delete blueprint'));
          });
      } catch {
        res.status(500).json(apiError(500, 'Failed to delete blueprint'));
      }
    }
  }

  public likeBlueprint(req: Request, res: Response) {
    console.log('likeBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      try {
        let user = req.user as UserJwt;
        let blueprintLike = req.body as BlueprintLike;

        if (blueprintLike.blueprintId == null || blueprintLike.like == null || user == null) {
          res.status(400).json(apiError(400, 'Missing blueprintId or like'));
          return;
        }

        // Drafts are invisible to everyone but owner/admin — 404 (not 403) so
        // draft ids can't be probed via the like endpoint.
        BlueprintModel.model
          .findById(blueprintLike.blueprintId)
          .select('owner isPublished')
          .lean()
          .then(target => {
            if (target == null || !canViewBlueprint(target, user)) {
              res.status(404).json(apiError(404, 'Blueprint not found'));
              return null;
            }
            return BlueprintController.applyLike(res, user, blueprintLike);
          })
          .catch(err => {
            console.log('likeBlueprint error');
            console.log(err);
            res.status(500).json(apiError(500, 'Failed to update like'));
          });
      } catch {
        res.status(500).json(apiError(500, 'Failed to update like'));
      }
    }
  }

  private static async applyLike(res: Response, user: UserJwt, blueprintLike: BlueprintLike) {
    // Atomic toggle keyed on current membership: concurrent or repeated
    // requests can't skew likeCount. matchedCount === 0 on an existing
    // blueprint just means "already in desired state" — idempotent 200.
    const userId = user._id;
    const update = blueprintLike.like
      ? BlueprintModel.model.updateOne(
          { _id: blueprintLike.blueprintId, likes: { $ne: userId } },
          { $push: { likes: userId }, $inc: { likeCount: 1 } }
        )
      : BlueprintModel.model.updateOne(
          { _id: blueprintLike.blueprintId, likes: userId },
          { $pull: { likes: userId }, $inc: { likeCount: -1 } }
        );

    const result = await update;
    if (result.matchedCount === 0) {
      if ((await BlueprintModel.model.exists({ _id: blueprintLike.blueprintId })) != null) {
        res.json({ likeBlueprint: 'OK' });
      } else res.status(404).json(apiError(404, 'Blueprint not found'));
      return;
    }

    if (blueprintLike.like) {
      const liked = await BlueprintModel.model.findById(blueprintLike.blueprintId).select('owner').lean();
      if (liked != null) {
        await NotificationController.notify({
          recipientId: liked.owner,
          actorId: userId,
          type: 'like',
          blueprintId: blueprintLike.blueprintId,
        });
      }
    }

    res.json({ likeBlueprint: 'OK' });
  }

  // Buffer a view/download hit in the write-behind counter cache. Drafts
  // never accumulate counts, and neither does the owner's own traffic —
  // these numbers exist for social proof, not analytics.
  private static recordCounter(
    kind: CounterKind,
    req: Request,
    blueprint: Pick<Blueprint, 'owner' | 'isPublished'> & { _id: unknown }
  ): void {
    if (blueprint.isPublished === false) return;
    const viewer = optionalViewer(req);
    const ownerId = UserModel.isUser(blueprint.owner)
      ? (blueprint.owner.id as string)
      : blueprint.owner?.toString();
    if (viewer != null && viewer._id === ownerId) return;
    // Logged-in viewers dedupe by user id; anonymous ones by client IP
    const viewerKey = viewer != null ? viewer._id : `ip:${req.clientIp ?? 'unknown'}`;
    BlueprintCounterService.instance.record(kind, String(blueprint._id), viewerKey);
  }

  public async getBlueprint(req: Request, res: Response): Promise<void> {
    console.log('getBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) {
      res.status(503).send();
      return;
    }
    // TODO checks here
    let id = req.params.id;
    let userId = req.query.userId;

    try {
      const blueprint = await BlueprintModel.model.findOne({ _id: id });
      // TODO: this endpoint (like getBlueprintMod/getBlueprintThumbnail) still
      // serves soft-deleted blueprints — pre-existing behavior, left as is.
      if (blueprint == null || !canViewBlueprint(blueprint, optionalViewer(req))) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      let likedByMe = false;
      if (
        userId != null &&
        blueprint.likes != null &&
        blueprint.likes.indexOf(userId as string) != -1
      )
        likedByMe = true;

      // Fallback covers docs the migration hasn't touched yet
      let nbLikes = blueprint.likeCount ?? blueprint.likes?.length ?? 0;

      let response: BlueprintResponse = {
        id: (blueprint._id as any).toString(),
        name: blueprint.name,
        data: await resolveCurrentData(blueprint),
        likedByMe: likedByMe,
        nbLikes: nbLikes,
        gameVersion: blueprint.gameVersion ?? null,
        category: blueprint.category ?? null,
        subcategory: blueprint.subcategory ?? null,
        description: blueprint.description ?? null,
        researchTier: blueprint.researchTier ?? null,
        modded: blueprint.modded ?? null,
        isPublished: blueprint.isPublished !== false,
      };

      // Editor open counts as a view; the dedupe window makes the common
      // details-page → editor hop count once, not twice. Recorded only after
      // the payload assembled — a failed serve must not count.
      BlueprintController.recordCounter('view', req, blueprint);

      res.json(response);
    } catch (err) {
      console.log('Blueprint find error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve blueprint'));
    }
  }

  public async getBlueprintMod(req: Request, res: Response): Promise<void> {
    console.log('getBlueprintMod' + req.clientIp);
    if (BlueprintModel.model == null) {
      res.status(503).send();
      return;
    }
    // TODO checks here
    let id = req.params.id;
//       let _userId = req.query.userId;

    try {
      const blueprint = await BlueprintModel.model.findOne({ _id: id });
      // Drafts 404 for anyone but owner/admin — the anonymous ONI mod cannot
      // import a draft by id (by design).
      if (blueprint == null || !canViewBlueprint(blueprint, optionalViewer(req))) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      let mdbBlueprint = (await resolveCurrentData(blueprint)) as MdbBlueprint;
      let angularBlueprint = new sharedBlueprint();
      angularBlueprint.importFromMdb(mdbBlueprint);
      let bniBlueprint = angularBlueprint.toBniBlueprint(blueprint.name);

      // The ONI mod pulling a blueprint by id is a download
      BlueprintController.recordCounter('download', req, blueprint);

      res.json(bniBlueprint);
    } catch (err) {
      console.log('Blueprint find error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve blueprint'));
    }
  }

  public getBlueprintThumbnail(req: Request, res: Response) {
    console.log('getBlueprintThumbnail' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO checks here
      let id = req.params.id;
//       let _userId = req.query.userId;

      BlueprintModel.model
        .find({ _id: id })
        .then(blueprints => {
          if (blueprints.length > 0 && canViewBlueprint(blueprints[0], optionalViewer(req))) {
            let blueprint = blueprints[0];

            let mdbBlueprint = blueprint.data as MdbBlueprint;
            let angularBlueprint = new sharedBlueprint();
            angularBlueprint.importFromMdb(mdbBlueprint);

            // TODO not sure if I should allow users to regen, or just serve the save thumbnail
            //PixiBackend.pixiBackend.generateThumbnail(angularBlueprint);

            res.json({ status: 'ok' });
          } else res.status(404).json(apiError(404, 'Blueprint not found'));
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json(apiError(500, 'Failed to retrieve blueprint'));
        });
    }
  }

  public getBlueprints(req: Request, res: Response) {
    console.log('getBlueprints' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      let filterUserId: string;
      let filterName: string;
      let filterGameVersion: string | null = null;
      let filterCategory: string | null = null;
      let filterSubcategory: string | null = null;
      let filterModded: boolean | null = null;
      let filterForkedFrom: string | null = null;
      let filterLikedBy: string | null = null;
      let sort: BlueprintSort;
      let skip = 0;

      let userId = '';
      let userJwt = req.user as UserJwt;
      if (userJwt != null) userId = userJwt._id;

      const dateFilter = parseOlderThan(req, res);
      if (dateFilter == null) return;

      try {
        filterUserId = req.query.filterUserId as string;
        const rawFilterName = req.query.filterName as string;
        if (rawFilterName != null && rawFilterName.length > 60) {
          res.status(400).json(apiError(400, 'filterName must be 60 characters or fewer'));
          return;
        }
        filterName = rawFilterName;

        const rawGameVersion = req.query.gameVersion as string | undefined;
        if (rawGameVersion != null && !(GAME_VERSIONS as readonly string[]).includes(rawGameVersion)) {
          res.status(400).json(apiError(400, `Invalid gameVersion: must be one of ${GAME_VERSIONS.join(', ')}`));
          return;
        }
        filterGameVersion = rawGameVersion ?? null;

        const rawCategory = req.query.category as string | undefined;
        if (rawCategory != null && !(CATEGORIES as readonly string[]).includes(rawCategory)) {
          res.status(400).json(apiError(400, `Invalid category: must be one of ${CATEGORIES.join(', ')}`));
          return;
        }
        filterCategory = rawCategory ?? null;

        filterSubcategory = req.query.subcategory as string ?? null;

        const rawModded = req.query.modded as string | undefined;
        if (rawModded != null && rawModded !== 'true' && rawModded !== 'false') {
          res.status(400).json(apiError(400, "Invalid modded: must be 'true' or 'false'"));
          return;
        }
        filterModded = rawModded != null ? rawModded === 'true' : null;

        const rawForkedFrom = req.query.forkedFrom as string | undefined;
        if (rawForkedFrom != null && !mongoose.Types.ObjectId.isValid(rawForkedFrom)) {
          res.status(400).json(apiError(400, 'Invalid forkedFrom: must be a valid blueprint id'));
          return;
        }
        filterForkedFrom = rawForkedFrom ?? null;

        const rawLikedBy = req.query.likedBy as string | undefined;
        if (rawLikedBy != null && !mongoose.Types.ObjectId.isValid(rawLikedBy)) {
          res.status(400).json(apiError(400, 'Invalid likedBy: must be a valid user id'));
          return;
        }
        // Liked blueprints are private — only the owner can list their own likes (matches
        // the profile page's "Liked" tab, which is only ever rendered on your own profile).
        if (rawLikedBy != null && rawLikedBy !== userId) {
          res.status(403).json(apiError(403, 'Cannot view another user\'s liked blueprints'));
          return;
        }
        filterLikedBy = rawLikedBy ?? null;

        const rawSort = req.query.sort as string | undefined;
        if (rawSort != null && !(SORTS as readonly string[]).includes(rawSort)) {
          res.status(400).json(apiError(400, `Invalid sort: must be one of ${SORTS.join(', ')}`));
          return;
        }
        sort = (rawSort as BlueprintSort) ?? 'recent';

        const rawSkip = req.query.skip as string | undefined;
        if (rawSkip != null) {
          skip = parseInt(rawSkip);
          // cap skip: MongoDB scans and discards skipped documents server-side,
          // so an unbounded offset is a cheap way to force slow queries
          if (isNaN(skip) || skip < 0 || skip > MAX_SKIP || String(skip) !== rawSkip) {
            res.status(400).json(apiError(400, `Invalid skip parameter: must be an integer between 0 and ${MAX_SKIP}`));
            return;
          }
        }
      } catch (error) {
        console.log(error);
        res.status(400).json(apiError(400, 'Invalid query parameters'));
        return;
      }

      // count-based sorts ignore the olderthan cursor (offset pagination via skip instead);
      // the param stays accepted so the existing client call shape keeps working
      const usesOffsetPagination = sort !== 'recent';
      let filter: any = usesOffsetPagination
        ? { $and: [{ deletedAt: null }] }
        : { $and: [{ createdAt: { $lt: dateFilter } }, { deletedAt: null }] };

      // Draft visibility: published blueprints for everyone, plus the viewer's
      // own drafts. Admins browsing a specific user's list (filterUserId) see
      // that user's drafts too, but drafts never leak into the general feed.
      // $ne: false (not $eq: true) so docs predating the backfill migration
      // stay visible in the deploy→migrate window.
      const isAdmin = userJwt?.role === 'admin';
      if (!(isAdmin && filterUserId != null)) {
        const visibleTo: any[] = [{ isPublished: { $ne: false } }];
        if (userId !== '') visibleTo.push({ owner: userId });
        filter.$and.push({ $or: visibleTo });
      }

      if (filterUserId != null) filter.$and.push({ owner: filterUserId });
      if (filterName != null) filter.$and.push({ name: { $regex: filterName, $options: 'i' } });
      if (filterGameVersion != null) filter.$and.push({ gameVersion: filterGameVersion });
      if (filterCategory != null) filter.$and.push({ category: filterCategory });
      if (filterSubcategory != null) filter.$and.push({ subcategory: filterSubcategory });
      if (filterModded != null) filter.$and.push({ modded: filterModded });
      if (filterForkedFrom != null) filter.$and.push({ 'forkedFrom.blueprintId': filterForkedFrom });
      if (filterLikedBy != null) filter.$and.push({ likes: filterLikedBy });

      let sortSpec: Record<string, 1 | -1> = { createdAt: -1 };
      if (sort === 'popular') sortSpec = { likeCount: -1, createdAt: -1 };
      else if (sort === 'mostForked') sortSpec = { forkCount: -1, createdAt: -1 };
      else if (sort === 'mostViewed') sortSpec = { viewCount: -1, createdAt: -1 };
      else if (sort === 'mostDownloaded') sortSpec = { downloadCount: -1, createdAt: -1 };

      let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
      let query = BlueprintModel.model
        .find(filter)
        .sort(sortSpec)
        .skip(usesOffsetPagination ? skip : 0)
        .limit(browseIncrement * 2)
        .populate('owner');

      query
        .then(blueprints => {
          return BlueprintController.handleGetBlueprint(req, res, userId, blueprints);
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json(apiError(500, 'Failed to retrieve blueprints'));
        });
    }
  }

  // Visible (non-deleted) comment counts for a page of blueprints, one aggregate.
  // The {blueprintId, parentId, lastActivityAt} index covers the match prefix.
  public static async getCommentCounts(
    blueprintIds: mongoose.Types.ObjectId[]
  ): Promise<Map<string, number>> {
    if (blueprintIds.length === 0 || CommentModel.model == null) return new Map();
    const rows: { _id: mongoose.Types.ObjectId; count: number }[] = await CommentModel.model.aggregate([
      { $match: { blueprintId: { $in: blueprintIds }, deletedAt: null } },
      { $group: { _id: '$blueprintId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map(row => [row._id.toString(), row.count]));
  }

  // Names (or soft-deleted status) of the parent blueprints referenced by forkedFrom
  // for a page of blueprints, one batched query. null name = parent soft-deleted.
  public static async getForkedFromNames(
    blueprintIds: mongoose.Types.ObjectId[]
  ): Promise<Map<string, string | null>> {
    if (blueprintIds.length === 0) return new Map();
    const parents = await BlueprintModel.model
      .find({ _id: { $in: blueprintIds } })
      .select('name deletedAt')
      .lean();
    return new Map(
      parents.map(parent => [
        (parent._id as mongoose.Types.ObjectId).toString(),
        parent.deletedAt != null ? null : (parent.name as string),
      ])
    );
  }

  public static async handleGetBlueprint(
    _req: Request,
    res: Response,
    userId: string,
    blueprints: Blueprint[]
  ) {
    let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);

    let returnValueAny = {};
    let returnValue = returnValueAny as BlueprintListResponse;
    returnValue.blueprints = [];
    returnValue.oldest = new Date();
    // must be present even for an empty page: a missing value used to read as
    // undefined on the client, which never matched the ===0 "done" check and
    // kept infinite scroll requesting forever
    returnValue.remaining = 0;

    if (blueprints.length) {
      returnValue.remaining = blueprints.length - browseIncrement;
      if (returnValue.remaining < 0) returnValue.remaining = 0;

      const page = blueprints.slice(0, Math.min(browseIncrement, blueprints.length));

      let commentCounts = new Map<string, number>();
      try {
        commentCounts = await BlueprintController.getCommentCounts(
          page.map(blueprint => blueprint._id as mongoose.Types.ObjectId)
        );
      } catch (err) {
        // Counts are decoration on the list — never fail the browse for them
        console.log('comment count aggregate error');
        console.log(err);
      }

      let forkedFromNames = new Map<string, string | null>();
      try {
        forkedFromNames = await BlueprintController.getForkedFromNames(
          page
            .filter(blueprint => blueprint.forkedFrom != null)
            .map(blueprint => blueprint.forkedFrom!.blueprintId)
        );
      } catch (err) {
        // Decoration on the list — never fail the browse for it
        console.log('forkedFrom name lookup error');
        console.log(err);
      }

      for (const blueprint of page) {
        if (blueprint.createdAt < returnValue.oldest) returnValue.oldest = blueprint.createdAt;

        let ownerId = '';
        let username: string = '';
        if (UserModel.isUser(blueprint.owner)) {
          username = blueprint.owner.username as string;
          ownerId = blueprint.owner.id as string;
        }

        let likedByMe = false;
        if (userId != null && blueprint.likes != null && blueprint.likes.indexOf(userId) != -1)
          likedByMe = true;

        let ownedByMe = false;
        if (userId != null && ownerId == userId) ownedByMe = true;

        let nbLikes = blueprint.likeCount ?? blueprint.likes?.length ?? 0;

        returnValue.blueprints.push({
          id: (blueprint._id as any).toString(),
          name: blueprint.name,
          ownerId: ownerId,
          ownerName: username,
          createdAt: blueprint.createdAt,
          modifiedAt: blueprint.modifiedAt,
          thumbnail: blueprint.thumbnail,
          nbLikes: nbLikes,
          likedByMe: likedByMe,
          ownedByMe: ownedByMe,
          commentCount: commentCounts.get((blueprint._id as any).toString()) ?? 0,
          gameVersion: blueprint.gameVersion ?? null,
          category: blueprint.category ?? null,
          subcategory: blueprint.subcategory ?? null,
          description: blueprint.description ?? null,
          modded: blueprint.modded ?? null,
          isPublished: blueprint.isPublished !== false,
          nbForks: blueprint.forkCount ?? 0,
          nbViews: blueprint.viewCount ?? 0,
          nbDownloads: blueprint.downloadCount ?? 0,
          forkedFrom:
            blueprint.forkedFrom != null
              ? {
                  blueprintId: blueprint.forkedFrom.blueprintId.toString(),
                  blueprintName: forkedFromNames.get(blueprint.forkedFrom.blueprintId.toString()) ?? null,
                }
              : null,
        });
      }

      res.json(returnValue);
    } else res.json(returnValue);
  }

  public publishBlueprint(req: Request, res: Response) {
    BlueprintController.setPublished(req, res, true);
  }

  public unpublishBlueprint(req: Request, res: Response) {
    BlueprintController.setPublished(req, res, false);
  }

  private static async setPublished(req: Request, res: Response, target: boolean): Promise<void> {
    if (BlueprintModel.model == null) {
      res.status(503).send();
      return;
    }
    try {
      const user = req.user as UserJwt;
      const blueprintId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const blueprint = await BlueprintModel.model
        .findById(blueprintId)
        .select('owner isPublished deletedAt')
        .lean();
      if (blueprint == null || blueprint.deletedAt != null) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const isOwner = blueprint.owner.toString() === user._id;
      if (!isOwner && user.role !== 'admin') {
        // Hide draft existence from non-owners; published blueprints are
        // visible so a plain 403 is fine there.
        if (blueprint.isPublished === false) {
          res.status(404).json(apiError(404, 'Blueprint not found'));
        } else {
          res.status(403).json(apiError(403, 'Not allowed to change publish state'));
        }
        return;
      }

      // State-guarded update: concurrent double-clicks match at most once, so
      // exactly one event is logged per real transition. Already in the target
      // state → idempotent 200, no event.
      const result = await BlueprintModel.model.updateOne(
        { _id: blueprintId, isPublished: { $ne: target } },
        { $set: { isPublished: target } }
      );
      if (result.modifiedCount === 1) {
        BlueprintEventService.log({
          blueprintId,
          // Admin actions are attributed to the admin, not the owner
          actorId: user._id,
          type: target ? 'published' : 'unpublished',
        });
      }
      res.json({ isPublished: target });
    } catch (err) {
      console.log('setPublished error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to update publish state'));
    }
  }

  // Meta-only payload for the details page: everything the card shows plus
  // description/research tier, without the heavy blueprint `data` the editor
  // fetches via /api/getblueprint/:id
  public async getBlueprintDetails(req: Request, res: Response): Promise<void> {
    try {
      if (BlueprintModel.model == null) {
        res.status(503).send();
        return;
      }

      const blueprintId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .populate('owner');
      const viewer = optionalViewer(req);
      if (!blueprint || !canViewBlueprint(blueprint, viewer)) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const viewerId = viewer?._id ?? null;

      let ownerId = '';
      let ownerName = '';
      if (UserModel.isUser(blueprint.owner)) {
        ownerName = blueprint.owner.username as string;
        ownerId = blueprint.owner.id as string;
      }

      let commentCounts = new Map<string, number>();
      try {
        commentCounts = await BlueprintController.getCommentCounts([
          blueprint._id as mongoose.Types.ObjectId,
        ]);
      } catch (err) {
        // Counts are decoration on the details page — never fail the fetch for them
        console.log('comment count aggregate error');
        console.log(err);
      }

      let forkedFromName: string | null = null;
      if (blueprint.forkedFrom != null) {
        try {
          const names = await BlueprintController.getForkedFromNames([blueprint.forkedFrom.blueprintId]);
          forkedFromName = names.get(blueprint.forkedFrom.blueprintId.toString()) ?? null;
        } catch (err) {
          console.log('forkedFrom name lookup error');
          console.log(err);
        }
      }

      const response: BlueprintDetailsResponse = {
        id: (blueprint._id as any).toString(),
        name: blueprint.name,
        ownerId,
        ownerName,
        createdAt: blueprint.createdAt,
        modifiedAt: blueprint.modifiedAt,
        thumbnail: blueprint.thumbnail,
        nbLikes: blueprint.likeCount ?? blueprint.likes?.length ?? 0,
        likedByMe: viewerId != null && (blueprint.likes ?? []).indexOf(viewerId) !== -1,
        ownedByMe: viewerId != null && ownerId === viewerId,
        commentCount: commentCounts.get((blueprint._id as any).toString()) ?? 0,
        gameVersion: blueprint.gameVersion ?? null,
        category: blueprint.category ?? null,
        subcategory: blueprint.subcategory ?? null,
        description: blueprint.description ?? null,
        researchTier: blueprint.researchTier ?? null,
        modded: blueprint.modded ?? null,
        isPublished: blueprint.isPublished !== false,
        nbForks: blueprint.forkCount ?? 0,
        nbViews: blueprint.viewCount ?? 0,
        nbDownloads: blueprint.downloadCount ?? 0,
        forkedFrom:
          blueprint.forkedFrom != null
            ? { blueprintId: blueprint.forkedFrom.blueprintId.toString(), blueprintName: forkedFromName }
            : null,
      };

      // Details page open counts as a view (deduped against a later editor open)
      BlueprintController.recordCounter('view', req, blueprint);

      res.json(response);
    } catch (err) {
      console.log('getBlueprintDetails error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve blueprint details'));
    }
  }

  // Fire-and-forget beacon from the client: the .blueprint file export
  // happens entirely in the browser (no server fetch), so the frontend
  // reports it here to be counted.
  public async trackDownload(req: Request, res: Response): Promise<void> {
    try {
      if (BlueprintModel.model == null) {
        res.status(503).send();
        return;
      }

      const blueprintId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner isPublished')
        .lean();
      if (blueprint == null || !canViewBlueprint(blueprint, optionalViewer(req))) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      BlueprintController.recordCounter('download', req, blueprint);
      res.status(204).send();
    } catch (err) {
      console.log('trackDownload error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to record download'));
    }
  }

  private static async saveBlueprint(
    _req: Request,
    res: Response,
    blueprint: Blueprint,
    ownerId: string,
    name: string,
    data: any,
    thumbnail: string,
    overwriteCreateDate: boolean,
    metadata?: {
      gameVersion: string | null;
      category: string | null;
      subcategory: string | null;
      description: string | null;
      researchTier: string | null;
      modded: boolean | null;
    },
    publish?: boolean | null
  ): Promise<void> {
    // New blueprints start as drafts (set explicitly — see the schema comment
    // on isPublished for why there is no schema default). Resurrect-via-
    // overwrite (soft-deleted doc reused) keeps its prior publish state and
    // logs 'updated' — the doc's history continues.
    if (blueprint.isNew) blueprint.isPublished = false;
    const wasPublished = blueprint.isPublished !== false;
    if (publish === true && !wasPublished) blueprint.isPublished = true;

    blueprint.owner = ownerId;
    blueprint.name = name;
    blueprint.data = data;
    blueprint.markModified('data');
    blueprint.thumbnail = thumbnail;
    blueprint.deletedAt = null;

    if (metadata) {
      blueprint.gameVersion = metadata.gameVersion;
      blueprint.category = metadata.category;
      blueprint.subcategory = metadata.subcategory;
      blueprint.description = metadata.description;
      blueprint.researchTier = metadata.researchTier;
      blueprint.modded = metadata.modded;
    }

    if (overwriteCreateDate || blueprint.createdAt == null) blueprint.createdAt = new Date();
    blueprint.modifiedAt = new Date();

    let newBlueprint;
    try {
      newBlueprint = await blueprint.save();
      // Keeps currentVersionId's data in sync with every save — the common read
      // path (load blueprint -> render current data) must never see stale data.
      await syncCurrentVersion(newBlueprint, data, thumbnail);
    } catch (error) {
      console.log('Blueprint save error');
      console.log(error);

      res.status(500).json(apiError(500, 'Failed to save blueprint'));
      return;
    }

    res.json({ id: newBlueprint.id });

    // Lifecycle event log (fire-and-forget). Version create/delete/restore
    // intentionally do not log 'updated' — the log tracks overwrite saves.
    BlueprintEventService.log({
      blueprintId: newBlueprint.id,
      actorId: ownerId,
      type: overwriteCreateDate ? 'created' : 'updated',
    });
    if (publish === true && !wasPublished) {
      BlueprintEventService.log({ blueprintId: newBlueprint.id, actorId: ownerId, type: 'published' });
    }

    // Render-on-write: warm the preview cache so the first browse view of
    // this save doesn't pay the render (preview-images-perf-2.md Phase 2).
    PreviewImageService.instance.prerender(newBlueprint.id, newBlueprint.modifiedAt, async () => data);

    try {
      BatchUtils.UpdatePositionCorrection(newBlueprint);
    } catch (error) {
      console.log('Position correction error');
      console.log(error);
    }

    // TODO: duplicate detection
    // The old approach (UpdateBasedOn) loaded every blueprint into memory on each upload — removed due to OOM crashes.
    // Proper approach: at upload time, compute a stable hash of the canonical blueprint content
    // (sorted blueprintItems by id+position, excluding metadata like name/thumbnail) and store it
    // on the document. Duplicate detection then becomes a single indexed query: find({ owner, contentHash }).
    // The batch script update-based-on.ts can be repurposed to backfill hashes on existing documents.
  }
}
