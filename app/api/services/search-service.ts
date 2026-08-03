import mongoose from 'mongoose';
import {
  electClusterCanonical,
  fuseRanks,
  rankCandidates,
  RankingCandidate,
  resolveTerms,
  tokenize,
} from '../../../lib/index';
import { BlueprintSearchModel } from '../models/blueprint-search';
import { getSearchTermDictionary } from './search-term-dictionary';

// Search retrieval pipeline (spec/multilingual-search-plan.md §2.3/§2.4/§2.6):
//   normalize → term-resolve → lexical + structural retrieval → RRF → rank.
// Returns a relevance-ordered list of blueprint ids; the CALLER re-applies
// the authoritative visibility filter against the blueprints collection, so
// this layer never needs to know about drafts, owners or admin views — a
// stale search row can cost recall, never leak a document.

// Retrieval depth per branch. Deeper than any page a user will reach, small
// enough that the in-memory fuse/rank stays trivial at this corpus size.
const RETRIEVAL_LIMIT = 300;
// Hard cap on what a single search hands the query layer as an $in list —
// it bounds the fused result set, so pagination past 500 ranked matches
// returns empty pages even when more documents technically match. At ~4.6K
// live blueprints nobody pages that deep; revisit alongside a real total
// count if the corpus grows 10×.
export const MAX_SEARCH_IDS = 500;

// Kill switch, same pattern as facetsEnabled: read live so an env flip +
// restart reverts search to the legacy name-regex without a deploy.
export function searchV2Enabled(): boolean {
  return process.env.SEARCH_V2_ENABLED !== 'false';
}

interface RetrievedRow {
  blueprintId: mongoose.Types.ObjectId;
  title?: string;
  ratingAverage?: number;
  ratingCount?: number;
  downloadCount?: number;
  forkCount?: number;
  clusterKey?: string | null;
  blueprintCreatedAt?: Date | null;
}

// One relevance-ordered match, carrying what read-time duplicate collapse
// needs (§2.5): which cluster it belongs to, and the signals that elect a
// cluster's canonical member.
export interface SearchMatch {
  id: mongoose.Types.ObjectId;
  clusterKey: string | null;
  ratingAverage: number;
  ratingCount: number;
  downloadCount: number;
  forkCount: number;
  createdAt: Date | null;
}

const RETRIEVAL_FIELDS =
  'blueprintId title ratingAverage ratingCount downloadCount forkCount clusterKey blueprintCreatedAt';

// Lexical retrieval: $text over title/terms/description, per-row stemming.
// Restricted to the viewer-relevant languages — today the 'en' pivot rows
// every blueprint has; a viewerLang joins the $in once non-English rows exist.
async function lexicalRetrieval(normalizedQuery: string): Promise<RetrievedRow[]> {
  if (normalizedQuery.length === 0) return [];
  return BlueprintSearchModel.model
    .find({ $text: { $search: normalizedQuery }, lang: { $in: ['en'] }, deletedAt: null })
    .select(RETRIEVAL_FIELDS)
    .sort({ score: { $meta: 'textScore' } })
    .limit(RETRIEVAL_LIMIT)
    .lean();
}

// Structural retrieval: termIds intersection, language-independent. For the
// 99.5% of the corpus with no description this is the backbone, not a
// supplement. Ordered by number of matched ids (then hotScore) — id-rarity
// IDF weighting is a noted follow-up, not built yet.
async function structuralRetrieval(resolvedIds: string[]): Promise<RetrievedRow[]> {
  if (resolvedIds.length === 0) return [];
  const rows = await BlueprintSearchModel.model.aggregate([
    { $match: { termIds: { $in: resolvedIds }, lang: 'en', deletedAt: null } },
    {
      $project: {
        blueprintId: 1,
        title: 1,
        ratingAverage: 1,
        ratingCount: 1,
        downloadCount: 1,
        forkCount: 1,
        clusterKey: 1,
        blueprintCreatedAt: 1,
        // Kept through the projection so the $sort below can actually
        // tie-break equal matched counts by popularity.
        hotScore: 1,
        matched: { $size: { $setIntersection: ['$termIds', resolvedIds] } },
      },
    },
    { $sort: { matched: -1, hotScore: -1, _id: 1 } },
    { $limit: RETRIEVAL_LIMIT },
  ]);
  return rows as RetrievedRow[];
}

/**
 * Resolves a free-text search to a relevance-ordered blueprint id list.
 * Returns [] when nothing matches (callers turn that into an empty page via
 * an $in match on nothing).
 */
export async function searchBlueprintIds(query: string): Promise<mongoose.Types.ObjectId[]> {
  return (await searchBlueprints(query)).map(match => match.id);
}

/**
 * As `searchBlueprintIds`, but each match carries its cluster key and the
 * signals a collapse needs. Callers that collapse duplicates use this;
 * callers that only need a filter (facet counts) use the id list.
 */
export async function searchBlueprints(query: string): Promise<SearchMatch[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const normalizedQuery = tokens.join(' ');

  // Resolve before anything else (§2.4): game nouns and community jargon
  // become structural ids without any further machinery.
  const resolution = resolveTerms(tokens, getSearchTermDictionary());

  const [lexical, structural] = await Promise.all([
    lexicalRetrieval(normalizedQuery),
    structuralRetrieval(resolution.resolvedIds),
  ]);

  const fused = fuseRanks([
    lexical.map(row => row.blueprintId.toString()),
    structural.map(row => row.blueprintId.toString()),
  ]);

  // Ranking signals come from whichever retrieval saw the row — both carry
  // the same denormalized values.
  const signalsById = new Map<string, RetrievedRow>();
  for (const row of [...lexical, ...structural]) {
    signalsById.set(row.blueprintId.toString(), row);
  }

  // "The title says what you typed": every query token appears in the
  // normalized title (see RankingCandidate.titleMatch for why RRF alone
  // can't express this).
  const titleMatches = (title: string | undefined): boolean => {
    if (title == null) return false;
    const titleTokens = new Set(tokenize(title));
    return tokens.every(token => titleTokens.has(token));
  };

  const candidates: RankingCandidate[] = fused.map(({ id, score }) => {
    const row = signalsById.get(id);
    return {
      id,
      fusionScore: score,
      titleMatch: titleMatches(row?.title),
      signals: {
        ratingAverage: row?.ratingAverage ?? 0,
        ratingCount: row?.ratingCount ?? 0,
        downloadCount: row?.downloadCount ?? 0,
        forkCount: row?.forkCount ?? 0,
      },
    };
  });

  return rankCandidates(candidates)
    .slice(0, MAX_SEARCH_IDS)
    .map(candidate => {
      const row = signalsById.get(candidate.id);
      return {
        id: new mongoose.Types.ObjectId(candidate.id),
        clusterKey: row?.clusterKey ?? null,
        ratingAverage: row?.ratingAverage ?? 0,
        ratingCount: row?.ratingCount ?? 0,
        downloadCount: row?.downloadCount ?? 0,
        forkCount: row?.forkCount ?? 0,
        createdAt: row?.blueprintCreatedAt ?? null,
      };
    });
}

export interface CollapsedMatch {
  id: mongoose.Types.ObjectId;
  // Other copies of the same build that also matched and are also visible.
  // 0 = nothing was collapsed behind this result.
  duplicateCount: number;
}

/**
 * Read-time duplicate collapse (§2.5). Keeps each cluster's canonical member
 * at the best rank any of its members reached, drops the rest, and reports
 * how many were dropped. Nothing is deleted or hidden from its owner — every
 * copy keeps its URL and its place on its owner's profile; this is a view.
 *
 * `visibleIds` is the set that survived the authoritative visibility filter,
 * so a canonical that is deleted or draft never suppresses a visible copy.
 */
export function collapseClusters(
  matches: SearchMatch[],
  visibleIds: Set<string>
): CollapsedMatch[] {
  const members = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    if (!visibleIds.has(match.id.toString())) continue;
    if (match.clusterKey == null) continue;
    const group = members.get(match.clusterKey);
    if (group != null) group.push(match);
    else members.set(match.clusterKey, [match]);
  }

  const canonicalByCluster = new Map<string, string>();
  for (const [clusterKey, group] of members) {
    const canonical = electClusterCanonical(
      group.map(match => ({
        id: match.id.toString(),
        ratingAverage: match.ratingAverage,
        ratingCount: match.ratingCount,
        downloadCount: match.downloadCount,
        forkCount: match.forkCount,
        createdAt: match.createdAt,
      }))
    );
    if (canonical != null) canonicalByCluster.set(clusterKey, canonical.id);
  }

  const collapsed: CollapsedMatch[] = [];
  const emittedClusters = new Set<string>();
  for (const match of matches) {
    const id = match.id.toString();
    if (!visibleIds.has(id)) continue;
    const clusterKey = match.clusterKey;
    if (clusterKey == null) {
      collapsed.push({ id: match.id, duplicateCount: 0 });
      continue;
    }
    // The whole cluster takes the rank of its best-placed member, which is
    // this one: emit the canonical here and skip every later member.
    if (emittedClusters.has(clusterKey)) continue;
    emittedClusters.add(clusterKey);
    const group = members.get(clusterKey) ?? [];
    const canonicalId = canonicalByCluster.get(clusterKey) ?? id;
    collapsed.push({
      id: new mongoose.Types.ObjectId(canonicalId),
      duplicateCount: group.length - 1,
    });
  }
  return collapsed;
}
