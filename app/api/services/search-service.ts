import mongoose from 'mongoose';
import {
  electClusterCanonical,
  fuseRanks,
  normalizeContentLocale,
  rankCandidates,
  RankingCandidate,
  resolveTerms,
  tokenize,
} from '../../../lib/index';
import { BlueprintSearchModel } from '../models/blueprint-search';
import { getSearchTermDictionary } from './search-term-dictionary';
import { detectLanguage, detectLanguageCode } from './language-detection-service';
import { TranslationBudgetExceeded, TranslationService } from './translation-service';
import { recordSearchQuery } from './search-query-service';

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
// `langs` is always ['en'] or ['<viewerLang>', 'en'] (searchBlueprints
// de-dupes and always keeps 'en' in the set) — the pivot invariant that
// structural retrieval depends on holds here too: every blueprint's 'en' row
// is always in scope, a native/accreted viewerLang row only ADDS a candidate,
// never replaces the pivot (search-followups.md Part 1 §4).
async function lexicalRetrieval(normalizedQuery: string, langs: readonly string[]): Promise<RetrievedRow[]> {
  if (normalizedQuery.length === 0) return [];
  const rows = await BlueprintSearchModel.model
    .find({ $text: { $search: normalizedQuery }, lang: { $in: [...langs] }, deletedAt: null })
    .select(RETRIEVAL_FIELDS)
    .sort({ score: { $meta: 'textScore' } })
    // Widening langs beyond ['en'] can surface two rows for one blueprint
    // (its 'en' pivot AND a native/accreted viewerLang row both matching) —
    // over-fetch so the dedup below still leaves RETRIEVAL_LIMIT distinct
    // blueprints rather than silently shrinking the candidate pool.
    .limit(RETRIEVAL_LIMIT * langs.length)
    .lean();

  // Collapse to one row per blueprint. searchBlueprints fuses by blueprintId;
  // two rows for one blueprint here would give it two ranks within this one
  // retrieval instead of the single rank a bilingual match should have —
  // silent double-counting, not a bonus. Rows arrive sorted by textScore, so
  // the first occurrence of a blueprintId is already its best-scoring row.
  const seen = new Set<string>();
  const deduped: RetrievedRow[] = [];
  for (const row of rows as RetrievedRow[]) {
    const key = row.blueprintId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= RETRIEVAL_LIMIT) break;
  }
  return deduped;
}

// Structural retrieval: termIds intersection, language-independent. For the
// 99.5% of the corpus with no description this is the backbone, not a
// supplement. Ordered by number of matched ids (then hotScore) — id-rarity
// IDF weighting is a noted follow-up, not built yet.
//
// Deliberately stays on lang:'en' only, unlike lexicalRetrieval — termIds are
// language-independent and every writer (deriveSearchRow, the phase 3b
// translated-title writer, phase 5's accretion) copies the SAME termIds onto
// every language row for a blueprint. Widening this $in would only return a
// second row carrying identical termIds for the same blueprint: a dedup cost
// for zero new signal, not a real narrowing of the pivot invariant.
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

export interface SearchOptions {
  // Author/viewer's UI-locale guess (Accept-Language) — telemetry only here.
  // The decision to spend a translation call always re-detects from the
  // query text alone with no prior, same split as search-index-service's
  // confidentTitleLang: a prior-derived guess is real enough to log, not
  // confident enough to bill.
  localePrior?: string | null;
  // Drives the per-user daily translation cap; null for anonymous/system
  // callers (site-wide monthly budget still applies either way).
  userId?: string | null;
  // The viewer's declared/resolved content locale (search-followups.md §2.5,
  // Part 1 §4) — joins 'en' in lexicalRetrieval's $in so a native-language
  // row (§2.9) or a lazily-accreted translated row (phase 5) can match
  // lexically too. Unset/invalid/'en' all resolve to ['en'] only, which
  // reproduces retrieval's pre-widening behaviour exactly — this is a pure
  // addition for every viewer who never touched the content-locale picker.
  viewerLang?: string | null;
}

// Attempts to translate the unresolved remainder of a query to English,
// cached hard via the same translationunits text-hash cache every other
// translation path uses (§1) — a repeat of the same nonsense query is free
// after the first hit. Never throws: a budget-exceeded or provider error
// just means the search proceeds on the untranslated tokens.
async function translateQueryRemainder(
  remainder: string,
  sourceLang: string,
  userId: string | null
): Promise<string | null> {
  if (!TranslationService.instance.isConfigured()) return null;
  try {
    const result = await TranslationService.instance.translateOne(
      { sourceText: remainder, sourceLang, targetLang: 'en' },
      userId
    );
    return result.degraded ? null : result.translatedText;
  } catch (err) {
    if (err instanceof TranslationBudgetExceeded) {
      console.log('search query translation budget exceeded — searching untranslated');
    } else {
      console.log('search query translation error');
      console.log(err);
    }
    return null;
  }
}

/**
 * Resolves a free-text search to a relevance-ordered blueprint id list.
 * Returns [] when nothing matches (callers turn that into an empty page via
 * an $in match on nothing).
 */
export async function searchBlueprintIds(
  query: string,
  options?: SearchOptions
): Promise<mongoose.Types.ObjectId[]> {
  return (await searchBlueprints(query, options)).map(match => match.id);
}

/**
 * As `searchBlueprintIds`, but each match carries its cluster key and the
 * signals a collapse needs. Callers that collapse duplicates use this;
 * callers that only need a filter (facet counts) use the id list.
 */
export async function searchBlueprints(
  query: string,
  options: SearchOptions = {}
): Promise<SearchMatch[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const normalizedQuery = tokens.join(' ');
  const dictionary = getSearchTermDictionary();

  // Resolve before anything else (§2.4): game nouns and community jargon
  // become structural ids without any further machinery, at zero cost.
  const resolution = resolveTerms(tokens, dictionary);

  // Telemetry-only read: informed by the locale prior, so it also captures
  // queries the strict/no-prior check below won't act on (§2.2's "log it
  // from day one" — the language distribution is the point, not just the
  // queries that spent money).
  const telemetryLang = detectLanguage(normalizedQuery, { prior: options.localePrior ?? null }).lang;

  let lexicalTokens = tokens;
  let structuralIds = resolution.resolvedIds;
  let translated = false;

  if (resolution.unresolvedTokens.length > 0) {
    // Fresh, no-prior detection — the strict billing gate. A prior alone
    // (e.g. an English query from a browser set to Vietnamese) must never
    // trigger a spend.
    const confidentLang = detectLanguageCode(normalizedQuery);
    if (confidentLang != null && confidentLang !== 'en') {
      const remainder = resolution.unresolvedTokens.join(' ');
      const translatedRemainder = await translateQueryRemainder(
        remainder,
        confidentLang,
        options.userId ?? null
      );
      if (translatedRemainder != null) {
        translated = true;
        const translatedTokens = tokenize(translatedRemainder);
        lexicalTokens = [...resolution.matchedTokens, ...translatedTokens];
        const extra = resolveTerms(translatedTokens, dictionary);
        for (const id of extra.resolvedIds) {
          if (!structuralIds.includes(id)) structuralIds.push(id);
        }
      }
    }
  }

  recordSearchQuery(normalizedQuery, telemetryLang, translated);

  // Bounded to at most two languages regardless of what the caller passes —
  // normalizeContentLocale only accepts a 2-3 letter base tag or returns
  // null, and the Set collapses 'en' to one entry. `?lang=` is a public,
  // unauthenticated query param (search-followups.md's session brief), so
  // this is what keeps it from becoming an unbounded fan-out over the
  // language set: there is no input that grows this $in past two languages.
  const viewerLang = normalizeContentLocale(options.viewerLang) ?? 'en';
  const lexicalLangs = [...new Set([viewerLang, 'en'])];

  const lexicalQuery = lexicalTokens.join(' ');
  const [lexical, structural] = await Promise.all([
    lexicalRetrieval(lexicalQuery, lexicalLangs),
    structuralRetrieval(structuralIds),
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
  // can't express this). Uses lexicalTokens, not the raw query tokens — a
  // translated query's original-language tokens can never appear in an
  // English row's title, so the effective (possibly-translated) tokens are
  // what "says what you typed" has to mean once translation ran.
  const titleMatches = (title: string | undefined): boolean => {
    if (title == null) return false;
    const titleTokens = new Set(tokenize(title));
    return lexicalTokens.every(token => titleTokens.has(token));
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
