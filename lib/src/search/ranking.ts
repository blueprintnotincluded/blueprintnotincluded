// Search ranking (spec/multilingual-search-plan.md §2.6): rules, not ML.
// Pure — every signal arrives denormalized on the candidate, so ranking
// needs no database and stays property-testable (the spec asserts ordering
// properties, never literal scores).

import { bayesianRating } from '../blueprint/blueprint-analyzer';

export interface RankingSignals {
  ratingAverage: number;
  ratingCount: number;
  downloadCount: number;
  forkCount: number;
}

export interface RankingCandidate {
  id: string;
  // RRF output (rrf.ts) — the text/term relevance term.
  fusionScore: number;
  // Every query token appears in the row's title. RRF alone cannot express
  // "the title says exactly what you typed": a term-only match retrieved by
  // BOTH branches out-fuses a title match retrieved by one, so title
  // exactness is its own signal, weighted above any achievable fusion gap.
  titleMatch: boolean;
  signals: RankingSignals;
}

// One exported constant object so the spec can assert ordering properties
// against exactly what production uses.
export const RANKING_WEIGHTS = {
  // RRF scores live in ~[0.008, 0.033] (1/(k+rank), k=60); this scale keeps
  // relevance dominant: the gap between a top-ranked exact title match and a
  // deep term-only match (~8e-3 raw) is worth ~40 points, more than any
  // achievable engagement total (~23). Adjacent fusion ranks differ by far
  // less, so engagement acts as the tiebreak between similar relevance —
  // which is the intent.
  fusion: 5000,
  // Must exceed the largest fusion+engagement gap a non-title match can
  // open: two-branch top fusion ≈ 2/61·5000 ≈ 164 vs one-branch ≈ 82, plus
  // ~23 achievable engagement points — 200 clears it with margin.
  titleMatch: 200,
  // Bayesian-damped star rating (blueprint-analyzer's bayesianRating, the
  // same damping hotScore uses): spans ~2.5..5 → up to 10 points.
  rating: 2,
  // log10-scaled counts; 1M downloads → 6 → 9 points.
  downloads: 1.5,
  forks: 1,
} as const;

export function rankingScore(candidate: RankingCandidate): number {
  const { fusionScore, signals } = candidate;
  return (
    RANKING_WEIGHTS.fusion * fusionScore +
    (candidate.titleMatch ? RANKING_WEIGHTS.titleMatch : 0) +
    RANKING_WEIGHTS.rating * bayesianRating(signals.ratingCount, signals.ratingAverage) +
    RANKING_WEIGHTS.downloads * Math.log10(1 + Math.max(0, signals.downloadCount)) +
    RANKING_WEIGHTS.forks * Math.log10(1 + Math.max(0, signals.forkCount))
  );
}

/** Sorts candidates by rankingScore desc; ties break on id for determinism. */
export function rankCandidates(candidates: RankingCandidate[]): RankingCandidate[] {
  return [...candidates].sort(
    (a, b) => rankingScore(b) - rankingScore(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
