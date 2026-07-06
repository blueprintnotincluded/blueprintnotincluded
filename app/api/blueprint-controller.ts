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
import { BatchUtils } from './batch/batch-utils';
import { apiError } from './utils/apiError';
import { parseOlderThan } from './utils/pagination';
import { optionalViewer } from './utils/optionalViewer';
import mongoose from 'mongoose';

const MAX_SKIP = 10000;

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
                metadata
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
              metadata
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

        update
          .then(async result => {
            if (
              result.matchedCount > 0 ||
              (await BlueprintModel.model.exists({ _id: blueprintLike.blueprintId })) != null
            ) {
              res.json({ likeBlueprint: 'OK' });
            } else res.status(404).json(apiError(404, 'Blueprint not found'));
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

  public getBlueprint(req: Request, res: Response) {
    console.log('getBlueprint' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO checks here
      let id = req.params.id;
      let userId = req.query.userId;

      BlueprintModel.model
        .find({ _id: id })
        .then(blueprints => {
          if (blueprints.length > 0) {
            let blueprint = blueprints[0];

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
              data: blueprint.data,
              likedByMe: likedByMe,
              nbLikes: nbLikes,
              gameVersion: blueprint.gameVersion ?? null,
              category: blueprint.category ?? null,
              subcategory: blueprint.subcategory ?? null,
              description: blueprint.description ?? null,
              researchTier: blueprint.researchTier ?? null,
              modded: blueprint.modded ?? null,
            };
            res.json(response);
          } else res.status(404).json(apiError(404, 'Blueprint not found'));
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json(apiError(500, 'Failed to retrieve blueprint'));
        });
    }
  }

  public getBlueprintMod(req: Request, res: Response) {
    console.log('getBlueprintMod' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      // TODO checks here
      let id = req.params.id;
//       let _userId = req.query.userId;

      BlueprintModel.model
        .find({ _id: id })
        .then(blueprints => {
          if (blueprints.length > 0) {
            let blueprint = blueprints[0];

            let mdbBlueprint = blueprint.data as MdbBlueprint;
            let angularBlueprint = new sharedBlueprint();
            angularBlueprint.importFromMdb(mdbBlueprint);
            let bniBlueprint = angularBlueprint.toBniBlueprint(blueprint.name);

            res.json(bniBlueprint);
          } else res.status(404).json(apiError(404, 'Blueprint not found'));
        })
        .catch(err => {
          console.log('Blueprint find error');
          console.log(err);
          res.status(500).json(apiError(500, 'Failed to retrieve blueprint'));
        });
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
          if (blueprints.length > 0) {
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
      let getDuplicates: boolean;
      let filterGameVersion: string | null = null;
      let filterCategory: string | null = null;
      let filterSubcategory: string | null = null;
      let sort: 'recent' | 'popular';
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
        getDuplicates = req.query.getDuplicates as any;

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

        const rawSort = req.query.sort as string | undefined;
        if (rawSort != null && rawSort !== 'recent' && rawSort !== 'popular') {
          res.status(400).json(apiError(400, "Invalid sort: must be one of recent, popular"));
          return;
        }
        sort = (rawSort as 'recent' | 'popular') ?? 'recent';

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

      // popular ignores the olderthan cursor (offset pagination via skip instead);
      // the param stays accepted so the existing client call shape keeps working
      let filter: any =
        sort === 'popular'
          ? { $and: [{ deletedAt: null }] }
          : { $and: [{ createdAt: { $lt: dateFilter } }, { deletedAt: null }] };

      if (filterUserId != null) filter.$and.push({ owner: filterUserId });
      if (filterName != null) filter.$and.push({ name: { $regex: filterName, $options: 'i' } });
      if (!getDuplicates) filter.$and.push({ $or: [{ isCopy: null }, { isCopy: false }] });
      if (filterGameVersion != null) filter.$and.push({ gameVersion: filterGameVersion });
      if (filterCategory != null) filter.$and.push({ category: filterCategory });
      if (filterSubcategory != null) filter.$and.push({ subcategory: filterSubcategory });

      let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
      let query = BlueprintModel.model
        .find(filter)
        .sort(sort === 'popular' ? { likeCount: -1, createdAt: -1 } : { createdAt: -1 })
        .skip(sort === 'popular' ? skip : 0)
        .limit(browseIncrement * 2)
        .populate('owner');

      query
        .then(blueprints => {
          BlueprintController.handleGetBlueprint(req, res, userId, blueprints);
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
          tags: blueprint.tags,
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
        });
      }

      res.json(returnValue);
    } else res.json(returnValue);
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
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const viewer = optionalViewer(req);
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

      const response: BlueprintDetailsResponse = {
        id: (blueprint._id as any).toString(),
        name: blueprint.name,
        ownerId,
        ownerName,
        tags: blueprint.tags,
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
      };
      res.json(response);
    } catch (err) {
      console.log('getBlueprintDetails error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve blueprint details'));
    }
  }

  private static saveBlueprint(
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
    }
  ) {
    blueprint.owner = ownerId;
    blueprint.name = name;
    // TODO tags
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

    blueprint
      .save()
      .then(newBlueprint => {
        let id = newBlueprint.id;
        res.json({ id: id });

        BatchUtils.UpdatePositionCorrection(newBlueprint);

        // TODO: duplicate detection
        // The old approach (UpdateBasedOn) loaded every blueprint into memory on each upload — removed due to OOM crashes.
        // Proper approach: at upload time, compute a stable hash of the canonical blueprint content
        // (sorted blueprintItems by id+position, excluding metadata like name/thumbnail) and store it
        // on the document. Duplicate detection then becomes a single indexed query: find({ owner, contentHash }).
        // The batch script update-based-on.ts can be repurposed to backfill hashes on existing documents.
      })
      .catch(error => {
        console.log('Blueprint save error');
        console.log(error);

        res.status(500).json(apiError(500, 'Failed to save blueprint'));
      });
  }
}
