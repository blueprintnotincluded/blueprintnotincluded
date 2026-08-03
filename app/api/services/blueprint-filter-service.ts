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

// Builds the mongo filter for getblueprints. blueprintfacets does not call
// this — its per-branch, dimension-omitting filters are built separately by
// buildFacetBaseFilter/buildFacetDimensionMatch below, which share
// buildCommonClauses/buildDimensionClauses with this function so the
// draft-visibility rules can't drift between the two endpoints.
export function buildBlueprintFilter(
  parsed: ParsedBlueprintFilters,
  ratedByIds: mongoose.Types.ObjectId[] | null,
  viewer: BlueprintFilterViewer,
  searchIds: mongoose.Types.ObjectId[] | null = null
): { filter: any; usesOffsetPagination: boolean } {
  // count-based sorts ignore the olderthan cursor (offset pagination via skip
  // instead); the param stays accepted so the existing client call shape keeps
  // working. Search results are relevance-ordered, so they paginate by offset
  // too — a createdAt cursor over a non-chronological order would skip and
  // repeat items.
  const usesOffsetPagination = parsed.sort !== 'recent' || searchIds != null;
  const filter: any = usesOffsetPagination
    ? { $and: [{ deletedAt: null }] }
    : { $and: [{ createdAt: { $lt: parsed.dateFilter } }, { deletedAt: null }] };

  filter.$and.push(...buildCommonClauses(parsed, ratedByIds, viewer, searchIds));

  const dims = buildDimensionClauses(parsed);
  if (dims.category != null) filter.$and.push(dims.category);
  if (dims.subcategory != null) filter.$and.push(dims.subcategory);
  if (dims.rooms != null) filter.$and.push(dims.rooms);
  filter.$and.push(...dims.dlc);

  return { filter, usesOffsetPagination };
}

// The clauses common to getblueprints and every blueprintfacets $facet
// branch: draft visibility, owner, name, modded, forkedFrom and ratedBy.
// Factored out once so the subtle visibility rules (viewerOwnsList, the
// admin branch, PUBLISHED_FILTER, never $or-ing the two) can't drift between
// the list endpoint and the facet-count aggregation.
function buildCommonClauses(
  parsed: ParsedBlueprintFilters,
  ratedByIds: mongoose.Types.ObjectId[] | null,
  viewer: BlueprintFilterViewer,
  searchIds: mongoose.Types.ObjectId[] | null = null
): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [];

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
    clauses.push({ isPublished: PUBLISHED_FILTER });
  }

  // Cast to ObjectId explicitly: buildBlueprintFilter's result goes through
  // Mongoose's .find() (which casts query values against the schema
  // automatically), but the facets aggregation pipeline hits the raw driver
  // via .aggregate(), which does not — a bare string here would silently
  // match nothing against the ObjectId-typed owner/forkedFrom fields.
  if (parsed.filterUserId != null) clauses.push({ owner: toObjectIdIfValid(parsed.filterUserId) });
  // Search v2 (spec/multilingual-search-plan.md): the search service already
  // resolved filterName to a relevance-ordered candidate id list, so the
  // clause is an id membership test ([] legitimately matches nothing). The
  // legacy regex path survives underneath for the SEARCH_V2_ENABLED=false
  // kill switch and as the fallback when the search layer errors.
  if (searchIds != null) {
    clauses.push({ _id: { $in: searchIds } });
  } else if (parsed.filterName != null) {
    // Escaped so filterName is a literal substring search: unescaped, a name
    // containing regex metacharacters ('(', '*', '[', ...) either 400s on an
    // invalid pattern or changes what it matches instead of searching for the
    // literal text the user typed.
    clauses.push({ name: { $regex: escapeRegExp(parsed.filterName), $options: 'i' } });
  }
  if (parsed.filterModded != null) clauses.push({ modded: parsed.filterModded });
  if (parsed.filterForkedFrom != null) {
    clauses.push({ 'forkedFrom.blueprintId': toObjectIdIfValid(parsed.filterForkedFrom) });
  }
  if (ratedByIds != null) clauses.push({ _id: { $in: ratedByIds } });

  return clauses;
}

function toObjectIdIfValid(id: string): string | mongoose.Types.ObjectId {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface DimensionClauses {
  category: Record<string, unknown> | null;
  subcategory: Record<string, unknown> | null;
  rooms: Record<string, unknown> | null;
  dlc: Record<string, unknown>[];
}

function buildDimensionClauses(parsed: ParsedBlueprintFilters): DimensionClauses {
  const dlc: Record<string, unknown>[] = [];
  // Documents predating DLC derivation have no requiredDlcs at all; $in
  // never matches a missing field, so they stay out of a dlc= result
  // rather than reading as base-game.
  if (parsed.filterDlcs != null) dlc.push({ requiredDlcs: { $in: parsed.filterDlcs } });
  // $nin over an array field matches when NONE of its elements are in the
  // list — true for [] (base game always survives exclusion) and true for
  // a missing field (a never-derived doc can't be known to need the
  // excluded pack, so it isn't hidden either). Note for the planner: $nin
  // can't produce a bounded range the way $in does, so this clause is
  // applied as a per-document filter during FETCH rather than narrowing an
  // index scan — the sort-driven index still bounds the query, this just
  // adds one field check per candidate.
  if (parsed.filterExcludeDlcs != null) dlc.push({ requiredDlcs: { $nin: parsed.filterExcludeDlcs } });

  return {
    category: parsed.filterCategory != null ? { category: parsed.filterCategory } : null,
    subcategory: parsed.filterSubcategory != null ? { subcategory: parsed.filterSubcategory } : null,
    rooms: parsed.filterRooms != null ? { rooms: { $in: parsed.filterRooms } } : null,
    dlc,
  };
}

// The blueprintfacets outer $match: every clause common to all five facet
// branches, with NO dimension clauses at all (a $facet branch can only
// narrow what the outer stage produced, so the outer stage must contain
// only what every branch agrees on). Pagination (sort/skip/olderthan) is
// deliberately never applied — counts describe the whole matching corpus,
// not one page of it.
export function buildFacetBaseFilter(
  parsed: ParsedBlueprintFilters,
  ratedByIds: mongoose.Types.ObjectId[] | null,
  viewer: BlueprintFilterViewer,
  searchIds: mongoose.Types.ObjectId[] | null = null
): any {
  return { $and: [{ deletedAt: null }, ...buildCommonClauses(parsed, ratedByIds, viewer, searchIds)] };
}

// One facet group's own $match, applied inside its $facet branch on top of
// buildFacetBaseFilter: every dimension's active clause EXCEPT `dimension`'s
// own. This is the "drill-down" / self-excluding semantics — picking a
// Spaced Out! filter must not zero out every other DLC's count. 'dlc' omits
// both the dlc= and excludeDlc= clauses at once (the two DLC facet groups
// share one count map over a single dimension). Pass `null` for the `total`
// branch, which (unlike every facet group) must apply ALL active dimension
// filters — it reports "docs matching every active filter", not a
// self-excluding count.
export function buildFacetDimensionMatch(
  parsed: ParsedBlueprintFilters,
  dimension: FilterDimension | null
): any {
  const dims = buildDimensionClauses(parsed);
  const clauses: Record<string, unknown>[] = [];
  if (dimension !== 'category' && dims.category != null) clauses.push(dims.category);
  if (dimension !== 'subcategory' && dims.subcategory != null) clauses.push(dims.subcategory);
  if (dimension !== 'rooms' && dims.rooms != null) clauses.push(dims.rooms);
  if (dimension !== 'dlc') clauses.push(...dims.dlc);
  return clauses.length > 0 ? { $and: clauses } : {};
}
