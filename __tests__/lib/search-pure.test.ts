import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  fuseRanks,
  normalizeText,
  rankCandidates,
  RankingCandidate,
  rankingScore,
  resolveTerms,
  stripKleiMarkup,
  tokenize,
} from '../../lib/index';

// Pure search functions (spec/multilingual-search-plan.md §5): no database,
// no network. The ranking spec asserts ORDERING PROPERTIES, never literal
// scores — "good results" isn't testable, orderings are.

describe('query-normalize', function () {
  it('casefolds, strips punctuation, and collapses whitespace', function () {
    expect(normalizeText('  SPOM!!  (v2.1) — Final ')).to.equal('spom v2 1 final');
  });

  it('applies NFC so composed and decomposed diacritics compare equal', function () {
    // Explicit escapes so no editor normalization can collapse the two literals.
    const composed = "m\u00e1y"; // precomposed a-acute
    const decomposed = "ma\u0301y"; // a + combining acute
    expect(normalizeText(composed)).to.equal(normalizeText(decomposed));
  });

  it('keeps non-Latin letters intact', function () {
    expect(normalizeText('Электростанция 발전소')).to.equal('электростанция 발전소');
  });

  it('tokenizes to [] on empty/punctuation-only input', function () {
    expect(tokenize('')).to.deep.equal([]);
    expect(tokenize('!!! ...')).to.deep.equal([]);
  });

  it('strips Klei rich-text markup', function () {
    expect(stripKleiMarkup('<link="WATERPURIFIER">Water Sieve</link>')).to.equal('Water Sieve');
  });
});

describe('term-resolve', function () {
  const dictionary = {
    byTerm: {
      'water sieve': ['WaterPurifier'],
      water: ['WaterPurifier', 'LiquidPump'],
      sieve: ['WaterPurifier'],
      spom: ['Electrolyzer', 'GasPump'],
      electrolyzer: ['Electrolyzer'],
    },
  };

  it('resolves community jargon to ids', function () {
    const result = resolveTerms(['spom'], dictionary);
    expect(result.resolvedIds).to.deep.equal(['Electrolyzer', 'GasPump']);
    expect(result.unresolvedTokens).to.deep.equal([]);
  });

  it('prefers the longest phrase match over its component tokens', function () {
    const result = resolveTerms(['water', 'sieve'], dictionary);
    // The two-token phrase wins: only WaterPurifier, not LiquidPump via 'water'
    expect(result.resolvedIds).to.deep.equal(['WaterPurifier']);
    expect(result.matchedTokens).to.deep.equal(['water', 'sieve']);
  });

  it('separates matched and unresolved tokens', function () {
    const result = resolveTerms(['spom', 'design', 'v2'], dictionary);
    expect(result.resolvedIds).to.deep.equal(['Electrolyzer', 'GasPump']);
    expect(result.matchedTokens).to.deep.equal(['spom']);
    expect(result.unresolvedTokens).to.deep.equal(['design', 'v2']);
  });

  it('dedupes ids across multiple matching tokens', function () {
    const result = resolveTerms(['spom', 'electrolyzer'], dictionary);
    expect(result.resolvedIds).to.deep.equal(['Electrolyzer', 'GasPump']);
  });
});

describe('rrf', function () {
  it('an id ranked well in both lists beats one ranked well in only one', function () {
    const fused = fuseRanks([
      ['a', 'b', 'c'],
      ['a', 'c'],
    ]);
    expect(fused[0].id).to.equal('a');
    const cScore = fused.find(f => f.id === 'c')!.score;
    const bScore = fused.find(f => f.id === 'b')!.score;
    // c: rank 3 + rank 2 in two lists; b: rank 2 in one — c's presence in
    // both retrievals outweighs b's single better rank at k=60
    expect(cScore).to.be.greaterThan(bScore);
  });

  it('is deterministic under ties', function () {
    const fused = fuseRanks([['b'], ['a']]);
    expect(fused.map(f => f.id)).to.deep.equal(['a', 'b']);
  });

  it('handles empty rankings', function () {
    expect(fuseRanks([[], []])).to.deep.equal([]);
  });
});

describe('ranking', function () {
  const NO_ENGAGEMENT = { ratingAverage: 0, ratingCount: 0, downloadCount: 0, forkCount: 0 };
  const MAX_ENGAGEMENT = {
    ratingAverage: 5,
    ratingCount: 10_000,
    downloadCount: 1_000_000,
    forkCount: 10_000,
  };
  // RRF extremes for a two-retrieval fusion: rank 1 in BOTH branches (the
  // best any candidate can fuse to) vs rank 1 in one, vs deep in one.
  const BOTH_BRANCHES_TOP_FUSION = 2 / 61;
  const ONE_BRANCH_TOP_FUSION = 1 / 61;
  const DEEP_TERM_FUSION = 1 / 90;

  it('a title match outranks the best possible non-title match at every engagement level', function () {
    // The hard case: the term-only candidate fused better (retrieved top by
    // BOTH branches) and has maximal engagement — the title signal must
    // still dominate.
    const exact: RankingCandidate = {
      id: 'exact',
      fusionScore: ONE_BRANCH_TOP_FUSION,
      titleMatch: true,
      signals: NO_ENGAGEMENT,
    };
    const term: RankingCandidate = {
      id: 'term',
      fusionScore: BOTH_BRANCHES_TOP_FUSION,
      titleMatch: false,
      signals: MAX_ENGAGEMENT,
    };
    expect(rankingScore(exact)).to.be.greaterThan(rankingScore(term));
  });

  it('with equal relevance, higher engagement wins', function () {
    const loved: RankingCandidate = {
      id: 'loved',
      fusionScore: DEEP_TERM_FUSION,
      titleMatch: false,
      signals: MAX_ENGAGEMENT,
    };
    const unloved: RankingCandidate = {
      id: 'unloved',
      fusionScore: DEEP_TERM_FUSION,
      titleMatch: false,
      signals: NO_ENGAGEMENT,
    };
    expect(rankCandidates([unloved, loved]).map(c => c.id)).to.deep.equal(['loved', 'unloved']);
  });

  it('one 5-star rating does not top an established 4.5-star blueprint', function () {
    const oneVote: RankingCandidate = {
      id: 'one-vote',
      fusionScore: DEEP_TERM_FUSION,
      titleMatch: false,
      signals: { ratingAverage: 5, ratingCount: 1, downloadCount: 0, forkCount: 0 },
    };
    const established: RankingCandidate = {
      id: 'established',
      fusionScore: DEEP_TERM_FUSION,
      titleMatch: false,
      signals: { ratingAverage: 4.5, ratingCount: 200, downloadCount: 0, forkCount: 0 },
    };
    expect(rankCandidates([oneVote, established])[0].id).to.equal('established');
  });

  it('is deterministic under exact ties', function () {
    const a: RankingCandidate = { id: 'a', fusionScore: DEEP_TERM_FUSION, titleMatch: false, signals: NO_ENGAGEMENT };
    const b: RankingCandidate = { id: 'b', fusionScore: DEEP_TERM_FUSION, titleMatch: false, signals: NO_ENGAGEMENT };
    expect(rankCandidates([b, a]).map(c => c.id)).to.deep.equal(['a', 'b']);
  });
});
