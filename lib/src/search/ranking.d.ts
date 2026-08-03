export interface RankingSignals {
    ratingAverage: number;
    ratingCount: number;
    downloadCount: number;
    forkCount: number;
}
export interface RankingCandidate {
    id: string;
    fusionScore: number;
    titleMatch: boolean;
    signals: RankingSignals;
}
export declare const RANKING_WEIGHTS: {
    readonly fusion: 5000;
    readonly titleMatch: 200;
    readonly rating: 2;
    readonly downloads: 1.5;
    readonly forks: 1;
};
export declare function rankingScore(candidate: RankingCandidate): number;
/** Sorts candidates by rankingScore desc; ties break on id for determinism. */
export declare function rankCandidates(candidates: RankingCandidate[]): RankingCandidate[];
//# sourceMappingURL=ranking.d.ts.map