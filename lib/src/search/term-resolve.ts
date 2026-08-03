// Query-token → game-id resolution (spec/multilingual-search-plan.md §2.2).
// Pure: the dictionary is data supplied by the caller (built from the game
// database's display names plus the hand-maintained alias file), so this
// works unchanged for any language whose dictionary exists.

export interface TermDictionary {
  // normalized term ("water sieve", "spom") → the ids it names. Multi-word
  // keys are single-space separated, exactly as normalizeText produces.
  byTerm: Record<string, string[]>;
}

export interface TermResolution {
  // Distinct ids named by the resolved tokens, in first-match order.
  resolvedIds: string[];
  // Tokens covered by some dictionary match.
  matchedTokens: string[];
  // Tokens no dictionary entry covers — what would go to translation.
  unresolvedTokens: string[];
}

// Longest dictionary key is currently 5 words ("mega heat deletion spom" is
// invented, but real building names reach 4: "portable gas bottle emptier").
const MAX_PHRASE_TOKENS = 5;

/**
 * Greedy longest-match-first n-gram scan over normalized tokens. "water
 * sieve build" resolves the two-token phrase before falling back to
 * single-token lookups, so "water" alone never mis-resolves once the phrase
 * matched.
 */
export function resolveTerms(tokens: string[], dictionary: TermDictionary): TermResolution {
  const resolvedIds: string[] = [];
  const seenIds = new Set<string>();
  const matchedTokens: string[] = [];
  const unresolvedTokens: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    let matchLength = 0;
    let matchIds: string[] | null = null;
    const maxLength = Math.min(MAX_PHRASE_TOKENS, tokens.length - i);
    for (let length = maxLength; length >= 1; length--) {
      const phrase = tokens.slice(i, i + length).join(' ');
      const ids = dictionary.byTerm[phrase];
      if (ids != null && ids.length > 0) {
        matchLength = length;
        matchIds = ids;
        break;
      }
    }

    if (matchIds != null) {
      for (const id of matchIds) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          resolvedIds.push(id);
        }
      }
      matchedTokens.push(...tokens.slice(i, i + matchLength));
      i += matchLength;
    } else {
      unresolvedTokens.push(tokens[i]);
      i += 1;
    }
  }

  return { resolvedIds, matchedTokens, unresolvedTokens };
}
