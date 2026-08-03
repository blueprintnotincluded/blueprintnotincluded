import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  ClusterItem,
  contentClusterKey,
  electClusterCanonical,
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

describe('cluster-key', function () {
  const ranch: ClusterItem[] = [
    { id: 'Ladder', x: 0, y: 0 },
    { id: 'GasPump', x: 2, y: 1, orientation: 1 },
    { id: 'Electrolyzer', x: 4, y: 0 },
  ];

  it('is stable under item order — the editor stores what it stores', function () {
    const shuffled = [ranch[2], ranch[0], ranch[1]];
    expect(contentClusterKey(shuffled)).to.equal(contentClusterKey(ranch));
  });

  it('is stable under translation — the same build selected elsewhere on the map', function () {
    const moved = ranch.map(item => ({ ...item, x: item.x + 137, y: item.y - 40 }));
    expect(contentClusterKey(moved)).to.equal(contentClusterKey(ranch));
  });

  it('changes when a single building moves relative to the rest', function () {
    const nudged = ranch.map((item, i) => (i === 1 ? { ...item, x: item.x + 1 } : item));
    expect(contentClusterKey(nudged)).to.not.equal(contentClusterKey(ranch));
  });

  it('changes when a building is rotated, replaced or added', function () {
    const key = contentClusterKey(ranch);
    expect(contentClusterKey(ranch.map((i, n) => (n === 0 ? { ...i, orientation: 2 } : i)))).to.not.equal(key);
    expect(contentClusterKey(ranch.map((i, n) => (n === 0 ? { ...i, id: 'Tile' } : i)))).to.not.equal(key);
    expect(contentClusterKey([...ranch, { id: 'Tile', x: 9, y: 9 }])).to.not.equal(key);
  });

  it('never clusters empty blueprints together', function () {
    expect(contentClusterKey([])).to.equal(null);
  });

  it('elects the most-engaged copy as a cluster canonical', function () {
    const canonical = electClusterCanonical([
      { id: 'quiet', downloadCount: 0, createdAt: new Date('2020-01-01') },
      { id: 'popular', downloadCount: 400, createdAt: new Date('2024-01-01') },
    ]);
    expect(canonical?.id).to.equal('popular');
  });

  it('falls back to the earliest copy — the probable original — when nobody has engagement', function () {
    const canonical = electClusterCanonical([
      { id: 'copy', createdAt: new Date('2024-01-01') },
      { id: 'original', createdAt: new Date('2019-06-01') },
    ]);
    expect(canonical?.id).to.equal('original');
  });

  it('is deterministic when copies are indistinguishable', function () {
    const members = [{ id: 'b' }, { id: 'a' }];
    expect(electClusterCanonical(members)?.id).to.equal('a');
    expect(electClusterCanonical([...members].reverse())?.id).to.equal('a');
  });
});
