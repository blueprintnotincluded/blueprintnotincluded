import mongoose from 'mongoose';
import { fuseRanks, rankCandidates, RankingCandidate, resolveTerms, tokenize } from '../../../lib/index';
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
}

// Lexical retrieval: $text over title/terms/description, per-row stemming.
// Restricted to the viewer-relevant languages — today the 'en' pivot rows
// every blueprint has; a viewerLang joins the $in once non-English rows exist.
async function lexicalRetrieval(normalizedQuery: string): Promise<RetrievedRow[]> {
  if (normalizedQuery.length === 0) return [];
  return BlueprintSearchModel.model
    .find({ $text: { $search: normalizedQuery }, lang: { $in: ['en'] }, deletedAt: null })
    .select('blueprintId title ratingAverage ratingCount downloadCount forkCount')
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
    .map(candidate => new mongoose.Types.ObjectId(candidate.id));
}
