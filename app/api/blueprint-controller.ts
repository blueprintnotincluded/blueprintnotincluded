import { Request, Response } from 'express';
import { BlueprintModel, Blueprint, thumbnailTypeOf } from './models/blueprint';
import {
  MdbBlueprint,
  BlueprintResponse,
  BlueprintListItem,
  BlueprintListResponse,
  RelatedBlueprintsResponse,
  BlueprintRate,
  BlueprintRateResponse,
//   Vector2,
//   CameraService,
//   Overlay,
//   ImageSource,
  BlueprintDelete,
  GAME_VERSIONS,
  CATEGORIES,
  SUBCATEGORIES,
  RESEARCH_TIERS,
  ROOM_TYPE_IDS,
  RAW_SOURCE_FORMATS,
  RawSourceFormat,
} from '../../lib/index';
import { Blueprint as sharedBlueprint, BlueprintDetailsResponse } from '../../lib/index';
import { computeHotScore } from '../../lib/index';
import { UserModel, UserJwt } from './models/user';
import { CommentModel } from './models/comment';
import { BlueprintRatingModel } from './models/blueprint-rating';
import { NotificationController } from './notification-controller';
import { BatchUtils } from './batch/batch-utils';
import { apiError } from './utils/apiError';
import { parseOlderThan } from './utils/pagination';
import { optionalViewer } from './utils/optionalViewer';
import { canViewBlueprint, ownerIdOf } from './utils/blueprint-visibility';
import { BlueprintEventService } from './services/blueprint-event-service';
import { BlueprintCounterService, CounterKind } from './services/blueprint-counter-service';
import {
  ensureCurrentVersion,
  resolveCurrentData,
  syncCurrentVersion,
} from './services/blueprint-version-service';
import { PreviewImageService } from './services/preview-image-service';
import { deriveRooms } from './services/room-derivation-service';
import { deriveMods } from './services/mod-derivation-service';
import { deriveDlcs } from './services/dlc-derivation-service';
import mongoose from 'mongoose';

const MAX_SKIP = 10000;

// Shape of a raw Klei DLC id (EXPANSION1_ID, DLC3_ID, …) — see lib/blueprint/dlc.ts
const DLC_ID_PATTERN = /^[A-Z0-9_]{1,32}$/;
const MAX_DLC_FILTER_IDS = 20;

const SORTS = ['recent', 'popular', 'mostForked', 'mostViewed', 'mostDownloaded', 'trending'] as const;
type BlueprintSort = (typeof SORTS)[number];

// How many "you might also like" cards the details page shows
const RELATED_LIMIT = 6;

// Upper bound for the verbatim BlueprintsV2 upload we store for byte-exact
// re-download. Real .blueprint files are tens of KB; the cap only guards the
// 16MB Mongo document limit (data + thumbnail + rawSource share it).
const MAX_RAW_SOURCE_BYTES = 2 * 1024 * 1024;

// Public-visibility clause for feed queries. $in's null matches docs that
// predate the isPublished backfill (deploy→migrate window), same coverage as
// the old { $ne: false } — but $in gives the planner point bounds, so the
// isPublished-prefixed indexes can still provide sort order for the
// count/rating sorts instead of fetching every live doc into a blocking SORT.
export const PUBLISHED_FILTER = { $in: [true, null] };

// Anonymous feed responses are viewer-independent, so Cloudflare can cache
// them at the edge; slightly stale lists are fine. Responses to requests
// carrying credentials are personalized (myRating/ownedByMe/own drafts) and
// must never be cached.
const ANON_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

function setFeedCacheControl(req: Request, res: Response) {
  res.set('Cache-Control', req.headers.authorization == null ? ANON_CACHE_CONTROL : 'no-store');
}

// The stored thumbnail data URI is user-supplied, so its declared mime cannot
// be trusted: a URI claiming image/svg+xml (scriptable when opened directly)
// or mislabeled bytes must never be echoed back as a Content-Type. Sniff the
// decoded bytes and only serve allowlisted raster formats.
function sniffImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  const ascii6 = bytes.subarray(0, 6).toString('latin1');
  if (ascii6 === 'GIF87a' || ascii6 === 'GIF89a') return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

      // Verbatim BlueprintsV2 source for byte-exact re-download (§8). The
      // client only sends it when the saved data still equals the imported
      // content; absence clears any previously stored raw so a stale original
      // can never be served for edited data.
      let rawSource: { source: string; format: RawSourceFormat } | null = null;
      if (req.body.rawSource != null) {
        const source = req.body.rawSource;
        const format = req.body.rawSourceFormat;
        if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_RAW_SOURCE_BYTES) {
          res.status(400).json(apiError(400, 'rawSource must be a string of at most 2MB'));
          return;
        }
        if (!(RAW_SOURCE_FORMATS as readonly string[]).includes(format)) {
          res.status(400).json(apiError(400, `rawSourceFormat must be one of ${RAW_SOURCE_FORMATS.join(', ')}`));
          return;
        }
        rawSource = { source, format };
      }

      // Copy-as-fork: when the editor saves a blueprint it loaded from
      // someone else's document, the client passes the source id so the new
      // copy is attributed as a fork. Malformed ids are treated as absent —
      // attribution is best-effort and must never fail the save.
      const rawSourceBlueprintId = req.body.sourceBlueprintId;
      const sourceBlueprintId =
        typeof rawSourceBlueprintId === 'string' &&
        mongoose.Types.ObjectId.isValid(rawSourceBlueprintId)
          ? rawSourceBlueprintId
          : null;

      BlueprintModel.model
        .find({ owner: ownerId, name: name })
        .then(async blueprints => {
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
                publish,
                null,
                rawSource
              );
            else res.json({ overwrite: true });
          } else {
            // Blueprints start unrated — authors can't rate their own work
            let blueprint = new BlueprintModel.model();
            const forkSource = await BlueprintController.resolveForkSource(
              sourceBlueprintId,
              user
            );
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
              publish,
              forkSource,
              rawSource
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

  public rateBlueprint(req: Request, res: Response) {
    console.log('rateBlueprint' + req.clientIp);
    if (BlueprintModel.model == null || BlueprintRatingModel.model == null) res.status(503).send();
    else {
      try {
        let user = req.user as UserJwt;
        let blueprintRate = req.body as BlueprintRate;

        if (
          blueprintRate.blueprintId == null ||
          user == null ||
          !Number.isInteger(blueprintRate.rating) ||
          blueprintRate.rating < 1 ||
          blueprintRate.rating > 5
        ) {
          res.status(400).json(apiError(400, 'Missing blueprintId or rating (integer 1-5)'));
          return;
        }

        // Drafts are invisible to everyone but owner/admin — 404 (not 403) so
        // draft ids can't be probed via the rate endpoint.
        BlueprintModel.model
          .findById(blueprintRate.blueprintId)
          .select('owner isPublished')
          .lean()
          .then(target => {
            if (target == null || !canViewBlueprint(target, user)) {
              res.status(404).json(apiError(404, 'Blueprint not found'));
              return null;
            }
            if (ownerIdOf(target) === user._id) {
              res.status(403).json(apiError(403, 'Cannot rate your own blueprint'));
              return null;
            }
            return BlueprintController.applyRating(res, user, blueprintRate, target.owner);
          })
          .catch(err => {
            console.log('rateBlueprint error');
            console.log(err);
            res.status(500).json(apiError(500, 'Failed to update rating'));
          });
      } catch {
        res.status(500).json(apiError(500, 'Failed to update rating'));
      }
    }
  }

  private static async applyRating(
    res: Response,
    user: UserJwt,
    blueprintRate: BlueprintRate,
    recipientId: string | mongoose.Types.ObjectId
  ) {
    // Upsert keyed on the unique {blueprintId, userId} index: repeated or
    // concurrent requests converge on one document with the latest value.
    const userId = user._id;
    const result = await BlueprintRatingModel.model.updateOne(
      { blueprintId: blueprintRate.blueprintId, userId },
      {
        $set: { value: blueprintRate.rating, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    const aggregate = await BlueprintController.recomputeRatingAggregate(blueprintRate.blueprintId);

    // Notify on a user's first rating only — value changes stay quiet
    if (result.upsertedCount > 0) {
      await NotificationController.notify({
        recipientId,
        actorId: userId,
        type: 'rating',
        blueprintId: blueprintRate.blueprintId,
      });
    }

    const response: BlueprintRateResponse = {
      nbRatings: aggregate.count,
      rating: aggregate.average,
      myRating: blueprintRate.rating,
    };
    res.json(response);
  }

  // Recompute one blueprint's denormalized rating aggregate from the ratings
  // collection and store it on the blueprint. Deliberately a separate,
  // server-side step (never read-time): the algorithm here will evolve —
  // plain average today, recency-weighted later — and a change is a re-run
  // of this function (or a batch job calling it), not a client change.
  public static async recomputeRatingAggregate(
    blueprintId: string
  ): Promise<{ count: number; average: number }> {
    const rows: { count: number; average: number }[] = await BlueprintRatingModel.model.aggregate([
      { $match: { blueprintId: new mongoose.Types.ObjectId(blueprintId) } },
      { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$value' } } },
      { $project: { _id: 0, count: 1, average: 1 } },
    ]);
    const aggregate = rows[0] ?? { count: 0, average: 0 };
    const update: Record<string, number> = {
      ratingCount: aggregate.count,
      ratingAverage: aggregate.average,
    };
    // Refresh the materialized trending score with the new rating aggregate.
    // Needs the doc's createdAt + current downloadCount (the other scoring
    // inputs) — one small projected read, off the request-critical path.
    const doc = await BlueprintModel.model
      .findById(blueprintId)
      .select('createdAt downloadCount')
      .lean();
    if (doc?.createdAt != null) {
      update.hotScore = computeHotScore({
        ratingCount: aggregate.count,
        ratingAverage: aggregate.average,
        downloadCount: doc.downloadCount ?? 0,
        createdAt: doc.createdAt,
      });
    }
    await BlueprintModel.model.updateOne({ _id: blueprintId }, { $set: update });
    return aggregate;
  }

  // Batch "my rating" lookup for a page of list items; one indexed query.
  public static async getMyRatings(
    blueprintIds: mongoose.Types.ObjectId[],
    userId: string
  ): Promise<Map<string, number>> {
    if (userId === '' || blueprintIds.length === 0 || BlueprintRatingModel.model == null) return new Map();
    const rows = await BlueprintRatingModel.model
      .find({ blueprintId: { $in: blueprintIds }, userId })
      .select('blueprintId value')
      .lean();
    return new Map(rows.map(row => [row.blueprintId.toString(), row.value]));
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
    const ownerId = ownerIdOf(blueprint);
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
    let id = String(req.params.id);

    try {
      const blueprint = await BlueprintModel.model.findOne({ _id: id });
      const viewer = optionalViewer(req);
      // TODO: this endpoint (like getBlueprintMod/getBlueprintThumbnail) still
      // serves soft-deleted blueprints — pre-existing behavior, left as is.
      if (blueprint == null || !canViewBlueprint(blueprint, viewer)) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      let myRating: number | null = null;
      if (viewer != null && BlueprintRatingModel.model != null) {
        const mine = await BlueprintRatingModel.model
          .findOne({ blueprintId: blueprint._id, userId: viewer._id })
          .select('value')
          .lean();
        myRating = mine?.value ?? null;
      }

      let response: BlueprintResponse = {
        id: (blueprint._id as any).toString(),
        name: blueprint.name,
        data: await resolveCurrentData(blueprint),
        nbRatings: blueprint.ratingCount ?? 0,
        rating: blueprint.ratingAverage ?? 0,
        myRating,
        gameVersion: blueprint.gameVersion ?? null,
        requiredDlcs: blueprint.requiredDlcs ?? [],
        category: blueprint.category ?? null,
        subcategory: blueprint.subcategory ?? null,
        description: blueprint.description ?? null,
        researchTier: blueprint.researchTier ?? null,
        modded: blueprint.modded ?? null,
        mods: blueprint.mods ?? [],
        rooms: blueprint.rooms ?? null,
        isPublished: blueprint.isPublished !== false,
        hasRawSource: blueprint.rawSource != null,
        rawSourceFormat: blueprint.rawSourceFormat ?? null,
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
    let id = String(req.params.id);
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

  // GET /api/blueprints/:id/raw — the verbatim BlueprintsV2 upload, served
  // byte-exact (spec/blueprintsv2-import-spec.md §8). 404 when the blueprint
  // has no stored raw (never imported, or edited since import). Never
  // regenerated from the parsed model.
  public async getBlueprintRawSource(req: Request, res: Response): Promise<void> {
    if (BlueprintModel.model == null) {
      res.status(503).send();
      return;
    }

    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).send();
      return;
    }

    try {
      const blueprint = await BlueprintModel.model
        .findOne({ _id: id, deletedAt: null })
        .select('name owner isPublished rawSource rawSourceFormat')
        .lean();
      if (
        !blueprint ||
        !canViewBlueprint(blueprint, optionalViewer(req)) ||
        blueprint.rawSource == null
      ) {
        res.status(404).json(apiError(404, 'No raw blueprint source available'));
        return;
      }

      // Fetching the original file is a download
      BlueprintController.recordCounter('download', req, blueprint);

      // Blueprint names are schema-restricted to [a-zA-Z0-9-_ ], safe to
      // embed in the disposition header as-is.
      const isShareString = blueprint.rawSourceFormat === 'bpv2-sharestring';
      res.set(
        'Content-Type',
        isShareString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'
      );
      res.set(
        'Content-Disposition',
        `attachment; filename="${blueprint.name}${isShareString ? '.txt' : '.blueprint'}"`
      );
      res.send(blueprint.rawSource);
    } catch (err) {
      console.log('Blueprint raw source error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve blueprint source'));
    }
  }

  // GET /api/blueprints/:id/thumbnail — the stored save-time thumbnail decoded
  // to its binary image. Only ever requested as the card's fallback when the
  // server-rendered preview errors; list responses carry the 'real' sentinel
  // instead of inlining this blob.
  public async getBlueprintThumbnail(req: Request, res: Response): Promise<void> {
    if (BlueprintModel.model == null) {
      res.status(503).send();
      return;
    }

    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).send();
      return;
    }

    try {
      const blueprint = await BlueprintModel.model
        .findOne({ _id: id, deletedAt: null })
        .select('thumbnail modifiedAt owner isPublished')
        .lean();
      if (!blueprint || !canViewBlueprint(blueprint, optionalViewer(req))) {
        res.status(404).send();
        return;
      }

      // Parse rather than trust thumbnailType: sentinels ('svg'/'svg_nothing')
      // and pre-migration junk all fail the match and 404. The mime comes from
      // sniffing the decoded bytes (not always png), and must agree with the
      // declared one — mismatches and non-raster formats (svg) 404.
      const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(blueprint.thumbnail ?? '');
      if (!match) {
        res.status(404).send();
        return;
      }
      const bytes = Buffer.from(match[2], 'base64');
      const declared = match[1].toLowerCase();
      const detected = sniffImageMime(bytes);
      if (!detected || detected !== (declared === 'image/jpg' ? 'image/jpeg' : declared)) {
        res.status(404).send();
        return;
      }

      const modifiedAt = blueprint.modifiedAt ?? null;
      const etag = `"${id}-${modifiedAt ? new Date(modifiedAt).getTime() : 0}-thumbnail"`;
      if (req.headers['if-none-match'] === etag) {
        res.set({ ETag: etag });
        res.status(304).end();
        return;
      }

      // Clients pass ?v=<modifiedAt ms> (same scheme as the preview urls), so
      // a long shared max-age is safe; draft thumbnails are owner/admin-only
      // and must never sit in a shared cache.
      const cacheControl =
        blueprint.isPublished === false ? 'private, no-store' : 'public, max-age=86400';

      res.set({
        'Content-Type': detected,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': cacheControl,
        ETag: etag,
      });
      res.send(bytes);
    } catch (err) {
      console.log('getBlueprintThumbnail error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve thumbnail'));
    }
  }

  public async getBlueprints(req: Request, res: Response) {
    console.log('getBlueprints' + req.clientIp);
    if (BlueprintModel.model == null) res.status(503).send();
    else {
      let filterUserId: string;
      let filterName: string;
      let filterGameVersion: string | null = null;
      let filterCategory: string | null = null;
      let filterSubcategory: string | null = null;
      let filterModded: boolean | null = null;
      let filterRooms: string[] | null = null;
      let filterDlcs: string[] | null = null;
      let filterForkedFrom: string | null = null;
      let filterRatedBy: string | null = null;
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

        // ?rooms=latrine,park -> blueprints containing ANY of the room types.
        // Values validated against the shared enum (400 on garbage, consistent
        // with category). Docs never derived (rooms null/absent) never match.
        const rawRooms = req.query.rooms as string | undefined;
        if (rawRooms != null) {
          const requested = rawRooms
            .split(',')
            .map(room => room.trim())
            .filter(room => room.length > 0);
          const invalid = requested.filter(
            room => !(ROOM_TYPE_IDS as readonly string[]).includes(room)
          );
          if (requested.length === 0 || invalid.length > 0) {
            res
              .status(400)
              .json(apiError(400, `Invalid rooms: must be a comma-separated list of ${ROOM_TYPE_IDS.join(', ')}`));
            return;
          }
          filterRooms = requested;
        }

        // ?dlc=DLC2_ID,DLC3_ID -> blueprints requiring ANY of these packs.
        // "Show me what the Bionic pack would unlock" is a membership question,
        // so $in (same semantics as rooms) is the right reading; the subset
        // test ("hide what I can't build") is a separate `owned=` param.
        //
        // Validated by *shape*, not against DLC_LABELS: a pack that ships in an
        // export before we've written a label for it must still be filterable,
        // which is the same reason the schema carries no enum.
        const rawDlc = req.query.dlc;
        if (rawDlc != null) {
          const requested = (Array.isArray(rawDlc) ? rawDlc : [rawDlc])
            .flatMap(value => String(value).split(','))
            .map(dlcId => dlcId.trim())
            .filter(dlcId => dlcId.length > 0);
          const invalid = requested.filter(dlcId => !DLC_ID_PATTERN.test(dlcId));
          // The cap only bounds the $in list — there are five packs today, so
          // anything near the limit is abuse rather than a real query.
          if (requested.length === 0 || requested.length > MAX_DLC_FILTER_IDS || invalid.length > 0) {
            res
              .status(400)
              .json(
                apiError(
                  400,
                  `Invalid dlc: must be a comma-separated list of up to ${MAX_DLC_FILTER_IDS} DLC ids (A-Z, 0-9 and _)`
                )
              );
            return;
          }
          filterDlcs = requested;
        }

        const rawForkedFrom = req.query.forkedFrom as string | undefined;
        if (rawForkedFrom != null && !mongoose.Types.ObjectId.isValid(rawForkedFrom)) {
          res.status(400).json(apiError(400, 'Invalid forkedFrom: must be a valid blueprint id'));
          return;
        }
        filterForkedFrom = rawForkedFrom ?? null;

        const rawRatedBy = req.query.ratedBy as string | undefined;
        if (rawRatedBy != null && !mongoose.Types.ObjectId.isValid(rawRatedBy)) {
          res.status(400).json(apiError(400, 'Invalid ratedBy: must be a valid user id'));
          return;
        }
        // Rated blueprints are private — only the owner can list their own ratings (matches
        // the profile page's "Rated" tab, which is only ever rendered on your own profile).
        if (rawRatedBy != null && rawRatedBy !== userId) {
          res.status(403).json(apiError(403, 'Cannot view another user\'s rated blueprints'));
          return;
        }
        filterRatedBy = rawRatedBy ?? null;

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

      // Draft visibility: the general feed is published-only for every viewer.
      // Owners see their own drafts when listing their own blueprints (the
      // profile page always passes filterUserId), and admins see drafts when
      // browsing a specific user's list — in both cases the owner clause below
      // already bounds the query, so the published filter is simply dropped.
      // Never combine the two as $or: [published, owner] — no index serves
      // both branches under a count sort, so Mongo falls back to fetching
      // every live 85KB doc into a blocking SORT (~16s on prod).
      const isAdmin = userJwt?.role === 'admin';
      const viewerOwnsList = filterUserId != null && filterUserId === userId;
      if (!viewerOwnsList && !(isAdmin && filterUserId != null)) {
        filter.$and.push({ isPublished: PUBLISHED_FILTER });
      }

      if (filterUserId != null) filter.$and.push({ owner: filterUserId });
      if (filterName != null) filter.$and.push({ name: { $regex: filterName, $options: 'i' } });
      if (filterGameVersion != null) filter.$and.push({ gameVersion: filterGameVersion });
      if (filterCategory != null) filter.$and.push({ category: filterCategory });
      if (filterSubcategory != null) filter.$and.push({ subcategory: filterSubcategory });
      if (filterModded != null) filter.$and.push({ modded: filterModded });
      if (filterRooms != null) filter.$and.push({ rooms: { $in: filterRooms } });
      // Documents predating DLC derivation have no requiredDlcs at all; $in
      // never matches a missing field, so they stay out of a dlc= result
      // rather than reading as base-game.
      if (filterDlcs != null) filter.$and.push({ requiredDlcs: { $in: filterDlcs } });
      if (filterForkedFrom != null) filter.$and.push({ 'forkedFrom.blueprintId': filterForkedFrom });
      if (filterRatedBy != null) {
        // Ratings live in their own collection; resolve to ids first (the
        // {userId, updatedAt} index covers this)
        try {
          const ratedIds =
            BlueprintRatingModel.model == null
              ? []
              : await BlueprintRatingModel.model.find({ userId: filterRatedBy }).distinct('blueprintId');
          filter.$and.push({ _id: { $in: ratedIds } });
        } catch (err) {
          console.log('ratedBy lookup error');
          console.log(err);
          res.status(500).json(apiError(500, 'Failed to retrieve blueprints'));
          return;
        }
      }

      let sortSpec: Record<string, 1 | -1> = { createdAt: -1 };
      if (sort === 'popular') sortSpec = { ratingAverage: -1, ratingCount: -1, createdAt: -1 };
      else if (sort === 'mostForked') sortSpec = { forkCount: -1, createdAt: -1 };
      else if (sort === 'mostViewed') sortSpec = { viewCount: -1, createdAt: -1 };
      else if (sort === 'mostDownloaded') sortSpec = { downloadCount: -1, createdAt: -1 };
      // Trending sorts on the materialized hotScore (lib computeHotScore),
      // refreshed on every engagement write — so it's a plain indexed sort
      // like every other sort, not a full-collection aggregation.
      else if (sort === 'trending') sortSpec = { hotScore: -1, createdAt: -1 };

      let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
      let skipAmount = usesOffsetPagination ? skip : 0;
      let limit = browseIncrement * 2;

      // -data -thumbnail: the list renders neither blueprint contents (~85KB
      // avg) nor the inline thumbnail data URI (~10-20KB) — together they
      // dominate the query's fetch cost otherwise
      BlueprintModel.model
        .find(filter)
        .sort(sortSpec)
        .skip(skipAmount)
        .limit(limit)
        .select('-data -thumbnail -rawSource')
        .populate('owner')
        .then(blueprints => {
          return BlueprintController.handleGetBlueprint(req, res, blueprints);
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

  public static async handleGetBlueprint(req: Request, res: Response, blueprints: Blueprint[]) {
    let browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
    setFeedCacheControl(req, res);

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
        returnValue.blueprints.push(
          BlueprintController.buildListItem(blueprint, commentCounts, forkedFromNames)
        );
      }

      res.json(returnValue);
    } else res.json(returnValue);
  }

  // Shared blueprint-document -> BlueprintListItem mapping, used by the browse
  // list, and the details page's related-blueprints shelf. Deliberately
  // viewer-independent: no per-viewer fields, so responses built from it are
  // byte-identical for every viewer and safe to cache at the edge. Per-viewer
  // state (myRating/ownedByMe) belongs to the details response only.
  private static buildListItem(
    blueprint: Blueprint,
    commentCounts: Map<string, number>,
    forkedFromNames: Map<string, string | null>
  ): BlueprintListItem {
    const id = (blueprint._id as any).toString();

    let ownerId = '';
    let username = '';
    if (UserModel.isUser(blueprint.owner)) {
      username = blueprint.owner.username as string;
      ownerId = blueprint.owner.id as string;
    }

    return {
      id,
      name: blueprint.name,
      ownerId,
      ownerName: username,
      createdAt: blueprint.createdAt,
      modifiedAt: blueprint.modifiedAt,
      // Sentinel only, never the ~10-20KB data URI — real images are fetched
      // via /api/blueprints/:id/thumbnail. Missing thumbnailType (docs in the
      // deploy→backfill-migration window) reads as 'real', the common case.
      thumbnail: blueprint.thumbnailType ?? 'real',
      nbRatings: blueprint.ratingCount ?? 0,
      rating: blueprint.ratingAverage ?? 0,
      commentCount: commentCounts.get(id) ?? 0,
      gameVersion: blueprint.gameVersion ?? null,
      requiredDlcs: blueprint.requiredDlcs ?? [],
      category: blueprint.category ?? null,
      subcategory: blueprint.subcategory ?? null,
      description: blueprint.description ?? null,
      modded: blueprint.modded ?? null,
      mods: blueprint.mods ?? [],
      rooms: blueprint.rooms ?? null,
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
    };
  }

  // "You might also like": same category/subcategory/gameVersion, or same
  // author, scored simply and merged. Two cheap indexed queries + in-memory
  // scoring — plenty at this catalog's size, and avoids an aggregation with
  // no single field to sort on. Backfills with recent public blueprints so
  // the shelf is never sparse for under-tagged or solo-author blueprints.
  public async getRelatedBlueprints(req: Request, res: Response): Promise<void> {
    if (BlueprintModel.model == null) {
      res.status(503).send();
      return;
    }

    const blueprintId = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
      res.status(400).json(apiError(400, 'Invalid blueprint id'));
      return;
    }

    try {
      const viewer = optionalViewer(req);
      const source = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner category subcategory gameVersion isPublished')
        .lean();
      if (source == null || !canViewBlueprint(source, viewer)) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const sourceOwnerId = ownerIdOf(source);

      const pools = await Promise.all([
        source.category != null
          ? BlueprintModel.model
              .find({
                deletedAt: null,
                isPublished: PUBLISHED_FILTER,
                category: source.category,
                _id: { $ne: blueprintId },
              })
              .sort({ ratingAverage: -1, ratingCount: -1, createdAt: -1 })
              .limit(RELATED_LIMIT * 4)
              .select('-data -thumbnail -rawSource')
              .populate('owner')
          : Promise.resolve([]),
        BlueprintModel.model
          .find({
            deletedAt: null,
            isPublished: PUBLISHED_FILTER,
            owner: source.owner,
            _id: { $ne: blueprintId },
          })
          .sort({ createdAt: -1 })
          .limit(RELATED_LIMIT * 4)
          .select('-data -thumbnail -rawSource')
          .populate('owner'),
      ]);

      const candidates = new Map<string, Blueprint>();
      for (const pool of pools) {
        for (const candidate of pool) candidates.set((candidate._id as mongoose.Types.ObjectId).toString(), candidate);
      }

      if (candidates.size < RELATED_LIMIT) {
        const fallback = await BlueprintModel.model
          .find({ deletedAt: null, isPublished: PUBLISHED_FILTER, _id: { $ne: blueprintId } })
          .sort({ createdAt: -1 })
          .limit(RELATED_LIMIT * 4)
          .select('-data -thumbnail -rawSource')
          .populate('owner');
        for (const candidate of fallback) candidates.set((candidate._id as mongoose.Types.ObjectId).toString(), candidate);
      }

      const scored = Array.from(candidates.values()).map(candidate => {
        let score = 0;
        if (source.category != null && candidate.category === source.category) score += 3;
        if (source.subcategory != null && candidate.subcategory === source.subcategory) score += 2;
        if (source.gameVersion != null && candidate.gameVersion === source.gameVersion) score += 1;
        if (sourceOwnerId != null && ownerIdOf(candidate) === sourceOwnerId) score += 2;
        return { candidate, score };
      });

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ratingDiff = (b.candidate.ratingAverage ?? 0) - (a.candidate.ratingAverage ?? 0);
        if (ratingDiff !== 0) return ratingDiff;
        return b.candidate.createdAt.getTime() - a.candidate.createdAt.getTime();
      });

      const page = scored.slice(0, RELATED_LIMIT).map(s => s.candidate);

      let commentCounts = new Map<string, number>();
      try {
        commentCounts = await BlueprintController.getCommentCounts(
          page.map(blueprint => blueprint._id as mongoose.Types.ObjectId)
        );
      } catch (err) {
        console.log('related comment count aggregate error');
        console.log(err);
      }

      let forkedFromNames = new Map<string, string | null>();
      try {
        forkedFromNames = await BlueprintController.getForkedFromNames(
          page.filter(blueprint => blueprint.forkedFrom != null).map(blueprint => blueprint.forkedFrom!.blueprintId)
        );
      } catch (err) {
        console.log('related forkedFrom name lookup error');
        console.log(err);
      }

      const response: RelatedBlueprintsResponse = {
        blueprints: page.map(blueprint =>
          BlueprintController.buildListItem(blueprint, commentCounts, forkedFromNames)
        ),
      };
      setFeedCacheControl(req, res);
      res.json(response);
    } catch (err) {
      console.log('getRelatedBlueprints error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve related blueprints'));
    }
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
      const blueprintId = String(req.params.id);
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

      const blueprintId = String(req.params.id);
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

      let detailsMyRating: number | null = null;
      if (viewerId != null) {
        try {
          const mine = await BlueprintController.getMyRatings(
            [blueprint._id as mongoose.Types.ObjectId],
            viewerId
          );
          detailsMyRating = mine.get((blueprint._id as any).toString()) ?? null;
        } catch (err) {
          console.log('details my-rating lookup error');
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
        nbRatings: blueprint.ratingCount ?? 0,
        rating: blueprint.ratingAverage ?? 0,
        myRating: detailsMyRating,
        ownedByMe: viewerId != null && ownerId === viewerId,
        commentCount: commentCounts.get((blueprint._id as any).toString()) ?? 0,
        gameVersion: blueprint.gameVersion ?? null,
        requiredDlcs: blueprint.requiredDlcs ?? [],
        category: blueprint.category ?? null,
        subcategory: blueprint.subcategory ?? null,
        description: blueprint.description ?? null,
        researchTier: blueprint.researchTier ?? null,
        modded: blueprint.modded ?? null,
        mods: blueprint.mods ?? [],
        rooms: blueprint.rooms ?? null,
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

      const blueprintId = String(req.params.id);
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

  // Copy-as-fork: a non-owner saving from the editor creates a new blueprint;
  // when the client names the source, attribute it as a fork. Any problem with
  // the source (missing, deleted, not viewable, requester's own document) just
  // skips attribution — the save itself must never fail because of it.
  private static async resolveForkSource(
    sourceBlueprintId: string | null,
    user: UserJwt
  ): Promise<{ source: Blueprint; versionId: mongoose.Types.ObjectId } | null> {
    if (sourceBlueprintId == null) return null;
    try {
      const source = await BlueprintModel.model.findOne({
        _id: sourceBlueprintId,
        deletedAt: null,
      });
      if (!source || !canViewBlueprint(source, user)) return null;
      if (source.owner.toString() === user._id.toString()) return null;
      const sourceVersion = await ensureCurrentVersion(source);
      return { source, versionId: sourceVersion._id as mongoose.Types.ObjectId };
    } catch (err) {
      console.log('fork source lookup error');
      console.log(err);
      return null;
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
    publish?: boolean | null,
    forkSource?: { source: Blueprint; versionId: mongoose.Types.ObjectId } | null,
    rawSource?: { source: string; format: RawSourceFormat } | null
  ): Promise<void> {
    // New blueprints start as drafts (set explicitly — see the schema comment
    // on isPublished for why there is no schema default). Resurrect-via-
    // overwrite (soft-deleted doc reused) keeps its prior publish state and
    // logs 'updated' — the doc's history continues.
    if (blueprint.isNew) blueprint.isPublished = false;
    const wasPublished = blueprint.isPublished !== false;
    if (publish === true && !wasPublished) blueprint.isPublished = true;

    // Copy-as-fork attribution (create path only — an overwrite of the
    // requester's own document keeps its history)
    if (blueprint.isNew && forkSource != null) {
      blueprint.forkedFrom = {
        blueprintId: forkSource.source._id as mongoose.Types.ObjectId,
        versionId: forkSource.versionId,
        forkedAt: new Date(),
      };
    }

    blueprint.owner = ownerId;
    blueprint.name = name;
    blueprint.data = data;
    blueprint.markModified('data');
    blueprint.thumbnail = thumbnail;
    blueprint.thumbnailType = thumbnailTypeOf(thumbnail);
    blueprint.deletedAt = null;
    // Derived fact, never client-supplied — any `rooms` key in the request
    // body is ignored (same policy as a client trying to set ratingCount).
    blueprint.rooms = deriveRooms(data);
    // Derived fact, never client-supplied (same policy as rooms).
    blueprint.mods = deriveMods(data);
    // Which DLCs the placed buildings require — also derived, never
    // client-supplied, and independent of the author's own game setup.
    blueprint.requiredDlcs = deriveDlcs(data);
    // Set on every save: absence clears a previously stored raw so it can
    // never go stale relative to `data` (see the model field comment).
    blueprint.rawSource = rawSource?.source ?? null;
    blueprint.rawSourceFormat = rawSource?.format ?? null;

    if (metadata) {
      blueprint.gameVersion = metadata.gameVersion;
      blueprint.category = metadata.category;
      blueprint.subcategory = metadata.subcategory;
      blueprint.description = metadata.description;
      blueprint.researchTier = metadata.researchTier;
      blueprint.modded = metadata.modded;
      // A blueprint using known-mod buildings is modded regardless of what the
      // client derived (protects against stale clients shipping the old heuristic).
      if (blueprint.mods.length > 0) blueprint.modded = true;
    }

    if (overwriteCreateDate || blueprint.createdAt == null) blueprint.createdAt = new Date();
    blueprint.modifiedAt = new Date();

    // Materialize the trending score so a newly created (or resurrected)
    // blueprint is sortable by trending immediately — new docs enter at the
    // prior-mean quality baseline + a high recency term (see computeHotScore).
    blueprint.hotScore = computeHotScore({
      ratingCount: blueprint.ratingCount ?? 0,
      ratingAverage: blueprint.ratingAverage ?? 0,
      downloadCount: blueprint.downloadCount ?? 0,
      createdAt: blueprint.createdAt,
    });

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

    // Copy-as-fork bookkeeping — mirrors POST /api/blueprints/:id/fork
    if (blueprint.forkedFrom != null && forkSource != null) {
      BlueprintModel.model
        .updateOne({ _id: forkSource.source._id }, { $inc: { forkCount: 1 } })
        .catch(err => {
          console.log('fork count increment error');
          console.log(err);
        });
      NotificationController.notify({
        recipientId: forkSource.source.owner,
        actorId: ownerId,
        type: 'fork',
        blueprintId: newBlueprint._id as mongoose.Types.ObjectId,
      }).catch(err => {
        console.log('fork notification error');
        console.log(err);
      });
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
