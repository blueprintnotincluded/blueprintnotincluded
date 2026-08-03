// Reciprocal Rank Fusion (spec/multilingual-search-plan.md §2.3): combines
// rankings from heterogeneous retrievals (a $text score and a term-overlap
// count share no scale) by rank position alone. Deterministic: ties break on
// id so the same inputs always fuse to the same order.

export const RRF_K = 60;

export interface FusedResult {
  id: string;
  score: number;
}

/**
 * Σ 1/(k + rank_i) over every ranking the id appears in (rank is 1-based).
 * Ids missing from a ranking simply contribute nothing for it.
 */
export function fuseRanks(rankings: string[][], k: number = RRF_K): FusedResult[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank];
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
