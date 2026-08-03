export interface TermDictionary {
    byTerm: Record<string, string[]>;
}
export interface TermResolution {
    resolvedIds: string[];
    matchedTokens: string[];
    unresolvedTokens: string[];
}
/**
 * Greedy longest-match-first n-gram scan over normalized tokens. "water
 * sieve build" resolves the two-token phrase before falling back to
 * single-token lookups, so "water" alone never mis-resolves once the phrase
 * matched.
 */
export declare function resolveTerms(tokens: string[], dictionary: TermDictionary): TermResolution;
//# sourceMappingURL=term-resolve.d.ts.map