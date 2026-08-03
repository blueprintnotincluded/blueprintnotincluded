export declare const RRF_K = 60;
export interface FusedResult {
    id: string;
    score: number;
}
/**
 * Σ 1/(k + rank_i) over every ranking the id appears in (rank is 1-based).
 * Ids missing from a ranking simply contribute nothing for it.
 */
export declare function fuseRanks(rankings: string[][], k?: number): FusedResult[];
//# sourceMappingURL=rrf.d.ts.map