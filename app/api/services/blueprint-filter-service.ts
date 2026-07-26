import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { CATEGORIES, ROOM_TYPE_IDS, DLC_ID_PATTERN, MAX_DLC_FILTER_IDS } from '../../../lib/index';
import { apiError } from '../utils/apiError';
import { parseOlderThan } from '../utils/pagination';
import { BlueprintRatingModel } from '../models/blueprint-rating';

const MAX_SKIP = 10000;

export const SORTS = ['recent', 'popular', 'mostForked', 'mostViewed', 'mostDownloaded', 'trending'] as const;
export type BlueprintSort = (typeof SORTS)[number];

// Public-visibility clause for feed queries. $in's null matches docs that
// predate the isPublished backfill (deploy→migrate window), same coverage as
// the old { $ne: false } — but $in gives the planner point bounds, so the
// isPublished-prefixed indexes can still provide sort order for the
// count/rating sorts instead of fetching every live doc into a blocking SORT.
export const PUBLISHED_FILTER = { $in: [true, null] };

export interface ParsedBlueprintFilters {
  filterUserId: string | null;
  filterName: string | null;
  filterCategory: string | null;
  filterSubcategory: string | null;
  filterModded: boolean | null;
  filterRooms: string[] | null;
  filterDlcs: string[] | null;
  filterExcludeDlcs: string[] | null;
  filterForkedFrom: string | null;
  filterRatedBy: string | null;
  sort: BlueprintSort;
  skip: number;
  dateFilter: Date;
}

export interface BlueprintFilterViewer {
  userId: string;
  isAdmin: boolean;
}

export type FilterDimension = 'category' | 'subcategory' | 'rooms' | 'dlc';

// Parses and validates the query params shared by getblueprints and
// blueprintfacets, writing the same 400/403 responses either endpoint would
// have written directly. Returns null once a response has been written.
export function parseBlueprintFilters(
  req: Request,
  res: Response,
  viewerUserId: string
): ParsedBlueprintFilters | null {
  const dateFilter = parseOlderThan(req, res);
  if (dateFilter == null) return null;

  try {
    const filterUserId = (req.query.filterUserId as string) ?? null;

    const rawFilterName = req.query.filterName as string;
    if (rawFilterName != null && rawFilterName.length > 60) {
      res.status(400).json(apiError(400, 'filterName must be 60 characters or fewer'));
      return null;
    }
    const filterName = rawFilterName ?? null;

    const rawCategory = req.query.category as string | undefined;
    if (rawCategory != null && !(CATEGORIES as readonly string[]).includes(rawCategory)) {
      res.status(400).json(apiError(400, `Invalid category: must be one of ${CATEGORIES.join(', ')}`));
      return null;
    }
    const filterCategory = rawCategory ?? null;

    const filterSubcategory = (req.query.subcategory as string) ?? null;

    const rawModded = req.query.modded as string | undefined;
    if (rawModded != null && rawModded !== 'true' && rawModded !== 'false') {
      res.status(400).json(apiError(400, "Invalid modded: must be 'true' or 'false'"));
      return null;
    }
    const filterModded = rawModded != null ? rawModded === 'true' : null;

    // ?rooms=latrine,park -> blueprints containing ANY of the room types.
    // Values validated against the shared enum (400 on garbage, consistent
    // with category). Docs never derived (rooms null/absent) never match.
    let filterRooms: string[] | null = null;
    const rawRooms = req.query.rooms as string | undefined;
    if (rawRooms != null) {
      const requested = rawRooms
        .split(',')
        .map(room => room.trim())
        .filter(room => room.length > 0);
      const invalid = requested.filter(room => !(ROOM_TYPE_IDS as readonly string[]).includes(room));
      if (requested.length === 0 || invalid.length > 0) {
        res
          .status(400)
          .json(apiError(400, `Invalid rooms: must be a comma-separated list of ${ROOM_TYPE_IDS.join(', ')}`));
        return null;
      }
      filterRooms = requested;
    }

    // ?dlc=DLC2_ID,DLC3_ID -> blueprints requiring ANY of these packs.
    // "Show me what the Bionic pack would unlock" is a membership question,
    // so $in (same semantics as rooms) is the right reading; the subset
    // test ("hide what I can't build") is a separate `excludeDlc=` param.
    //
    // Validated by *shape*, not against DLC_LABELS: a pack that ships in an
    // export before we've written a label for it must still be filterable,
    // which is the same reason the schema carries no enum.
    let filterDlcs: string[] | null = null;
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
        return null;
      }
      filterDlcs = requested;
    }

    // ?excludeDlc=DLC3_ID,DLC4_ID -> blueprints requiring NONE of these
    // packs. The complement of ?dlc= (membership vs. exclusion are
    // separate params, not a third state on one), so it composes: both can
    // be present at once. Same shape/size validation as dlc.
    let filterExcludeDlcs: string[] | null = null;
    const rawExcludeDlc = req.query.excludeDlc;
    if (rawExcludeDlc != null) {
      const requested = (Array.isArray(rawExcludeDlc) ? rawExcludeDlc : [rawExcludeDlc])
        .flatMap(value => String(value).split(','))
        .map(dlcId => dlcId.trim())
        .filter(dlcId => dlcId.length > 0);
      const invalid = requested.filter(dlcId => !DLC_ID_PATTERN.test(dlcId));
      if (requested.length === 0 || requested.length > MAX_DLC_FILTER_IDS || invalid.length > 0) {
        res
          .status(400)
          .json(
            apiError(
              400,
              `Invalid excludeDlc: must be a comma-separated list of up to ${MAX_DLC_FILTER_IDS} DLC ids (A-Z, 0-9 and _)`
            )
          );
        return null;
      }
      filterExcludeDlcs = requested;
    }

    const rawForkedFrom = req.query.forkedFrom as string | undefined;
    if (rawForkedFrom != null && !mongoose.Types.ObjectId.isValid(rawForkedFrom)) {
      res.status(400).json(apiError(400, 'Invalid forkedFrom: must be a valid blueprint id'));
      return null;
    }
    const filterForkedFrom = rawForkedFrom ?? null;

    const rawRatedBy = req.query.ratedBy as string | undefined;
    if (rawRatedBy != null && !mongoose.Types.ObjectId.isValid(rawRatedBy)) {
      res.status(400).json(apiError(400, 'Invalid ratedBy: must be a valid user id'));
      return null;
    }
    // Rated blueprints are private — only the owner can list their own ratings (matches
    // the profile page's "Rated" tab, which is only ever rendered on your own profile).
    if (rawRatedBy != null && rawRatedBy !== viewerUserId) {
      res.status(403).json(apiError(403, "Cannot view another user's rated blueprints"));
      return null;
    }
    const filterRatedBy = rawRatedBy ?? null;

    const rawSort = req.query.sort as string | undefined;
    if (rawSort != null && !(SORTS as readonly string[]).includes(rawSort)) {
      res.status(400).json(apiError(400, `Invalid sort: must be one of ${SORTS.join(', ')}`));
      return null;
    }
    const sort = (rawSort as BlueprintSort) ?? 'recent';

    let skip = 0;
    const rawSkip = req.query.skip as string | undefined;
    if (rawSkip != null) {
      skip = parseInt(rawSkip);
      // cap skip: MongoDB scans and discards skipped documents server-side,
      // so an unbounded offset is a cheap way to force slow queries
      if (isNaN(skip) || skip < 0 || skip > MAX_SKIP || String(skip) !== rawSkip) {
        res
          .status(400)
          .json(apiError(400, `Invalid skip parameter: must be an integer between 0 and ${MAX_SKIP}`));
        return null;
      }
    }

    return {
      filterUserId,
      filterName,
      filterCategory,
      filterSubcategory,
      filterModded,
      filterRooms,
      filterDlcs,
      filterExcludeDlcs,
      filterForkedFrom,
      filterRatedBy,
      sort,
      skip,
      dateFilter,
    };
  } catch (error) {
    console.log(error);
    res.status(400).json(apiError(400, 'Invalid query parameters'));
    return null;
  }
}

// Ratings live in their own collection; resolve to ids first (the
// {userId, updatedAt} index covers this). Throws on a db error — callers
// respond 500, matching the previous inline behaviour.
export async function resolveRatedByIds(
  parsed: ParsedBlueprintFilters
): Promise<mongoose.Types.ObjectId[] | null> {
  if (parsed.filterRatedBy == null) return null;
  if (BlueprintRatingModel.model == null) return [];
  return BlueprintRatingModel.model.find({ userId: parsed.filterRatedBy }).distinct('blueprintId');
}

// Builds the mongo filter shared by getblueprints and blueprintfacets.
// `omitDimensions` drops the listed facet groups' own clauses so a $facet
// branch can compute self-excluding ("drill-down") counts for those groups;
// 'dlc' drops both the dlc= and excludeDlc= clauses at once, since the two
// DLC facet groups (show-only, hide) share a single count map over one
// dimension. The blueprintfacets outer $match omits all four at once.
export function buildBlueprintFilter(
  parsed: ParsedBlueprintFilters,
  ratedByIds: mongoose.Types.ObjectId[] | null,
  viewer: BlueprintFilterViewer,
  omitDimensions?: FilterDimension | FilterDimension[]
): { filter: any; usesOffsetPagination: boolean } {
  const omitted = new Set(
    omitDimensions == null ? [] : Array.isArray(omitDimensions) ? omitDimensions : [omitDimensions]
  );
  // count-based sorts ignore the olderthan cursor (offset pagination via skip instead);
  // the param stays accepted so the existing client call shape keeps working
  const usesOffsetPagination = parsed.sort !== 'recent';
  const filter: any = usesOffsetPagination
    ? { $and: [{ deletedAt: null }] }
    : { $and: [{ createdAt: { $lt: parsed.dateFilter } }, { deletedAt: null }] };

  // Draft visibility: the general feed is published-only for every viewer.
  // Owners see their own drafts when listing their own blueprints (the
  // profile page always passes filterUserId), and admins see drafts when
  // browsing a specific user's list — in both cases the owner clause below
  // already bounds the query, so the published filter is simply dropped.
  // Never combine the two as $or: [published, owner] — no index serves
  // both branches under a count sort, so Mongo falls back to fetching
  // every live 85KB doc into a blocking SORT (~16s on prod).
  const viewerOwnsList = parsed.filterUserId != null && parsed.filterUserId === viewer.userId;
  if (!viewerOwnsList && !(viewer.isAdmin && parsed.filterUserId != null)) {
    filter.$and.push({ isPublished: PUBLISHED_FILTER });
  }

  if (parsed.filterUserId != null) filter.$and.push({ owner: parsed.filterUserId });
  if (parsed.filterName != null) filter.$and.push({ name: { $regex: parsed.filterName, $options: 'i' } });
  if (!omitted.has('category') && parsed.filterCategory != null) {
    filter.$and.push({ category: parsed.filterCategory });
  }
  if (!omitted.has('subcategory') && parsed.filterSubcategory != null) {
    filter.$and.push({ subcategory: parsed.filterSubcategory });
  }
  if (parsed.filterModded != null) filter.$and.push({ modded: parsed.filterModded });
  if (!omitted.has('rooms') && parsed.filterRooms != null) {
    filter.$and.push({ rooms: { $in: parsed.filterRooms } });
  }
  if (!omitted.has('dlc')) {
    // Documents predating DLC derivation have no requiredDlcs at all; $in
    // never matches a missing field, so they stay out of a dlc= result
    // rather than reading as base-game.
    if (parsed.filterDlcs != null) filter.$and.push({ requiredDlcs: { $in: parsed.filterDlcs } });
    // $nin over an array field matches when NONE of its elements are in the
    // list — true for [] (base game always survives exclusion) and true for
    // a missing field (a never-derived doc can't be known to need the
    // excluded pack, so it isn't hidden either). Note for the planner: $nin
    // can't produce a bounded range the way $in does, so this clause is
    // applied as a per-document filter during FETCH rather than narrowing an
    // index scan — the sort-driven index still bounds the query, this just
    // adds one field check per candidate.
    if (parsed.filterExcludeDlcs != null) {
      filter.$and.push({ requiredDlcs: { $nin: parsed.filterExcludeDlcs } });
    }
  }
  if (parsed.filterForkedFrom != null) filter.$and.push({ 'forkedFrom.blueprintId': parsed.filterForkedFrom });
  if (ratedByIds != null) filter.$and.push({ _id: { $in: ratedByIds } });

  return { filter, usesOffsetPagination };
}
