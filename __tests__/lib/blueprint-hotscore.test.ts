import { expect } from 'chai';
import { HotScoreInputs, HOT_SCORE, bayesianRating, computeHotScore } from '../../lib';

// A day in ms, to build createdAt values relative to a fixed "now".
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 1);
// createdAt for a blueprint published `ageDays` before NOW.
const aged = (ageDays: number): Date => new Date(NOW - ageDays * DAY);

const bp = (o: Partial<HotScoreInputs> & { ageDays?: number }): HotScoreInputs => ({
  ratingCount: o.ratingCount ?? 0,
  ratingAverage: o.ratingAverage ?? 0,
  downloadCount: o.downloadCount ?? 0,
  createdAt: o.createdAt ?? aged(o.ageDays ?? 0),
});

describe('computeHotScore (trending "new but also good")', () => {
  describe('bayesianRating shrinkage', () => {
    it('returns exactly the prior mean for zero votes', () => {
      expect(bayesianRating(0, 0)).to.equal(HOT_SCORE.PRIOR_MEAN);
    });

    it('pulls a single 5-star vote well below face value', () => {
      const wr = bayesianRating(1, 5);
      expect(wr).to.be.greaterThan(HOT_SCORE.PRIOR_MEAN);
      expect(wr).to.be.lessThan(4.2); // nowhere near 5.0
    });

    it('lets a well-established average win over a lone perfect score', () => {
      expect(bayesianRating(50, 4.5)).to.be.greaterThan(bayesianRating(1, 5));
    });

    it('approaches the true average as vote count grows', () => {
      expect(bayesianRating(1000, 4.5)).to.be.closeTo(4.5, 0.05);
    });
  });

  describe('ordering properties', () => {
    it('ranks the newer of two equally-good blueprints higher', () => {
      const older = bp({ ratingCount: 10, ratingAverage: 4, downloadCount: 100, ageDays: 10 });
      const newer = bp({ ratingCount: 10, ratingAverage: 4, downloadCount: 100, ageDays: 0 });
      expect(computeHotScore(newer)).to.be.greaterThan(computeHotScore(older));
    });

    it('ranks the better-rated of two same-age blueprints higher', () => {
      const worse = bp({ ratingCount: 10, ratingAverage: 3, ageDays: 2 });
      const better = bp({ ratingCount: 10, ratingAverage: 5, ageDays: 2 });
      expect(computeHotScore(better)).to.be.greaterThan(computeHotScore(worse));
    });

    it('is monotonic in downloads at equal age and rating', () => {
      const few = bp({ ratingCount: 5, ratingAverage: 4, downloadCount: 10, ageDays: 3 });
      const many = bp({ ratingCount: 5, ratingAverage: 4, downloadCount: 1000, ageDays: 3 });
      expect(computeHotScore(many)).to.be.greaterThan(computeHotScore(few));
    });

    it('does not let a brand-new mediocre blueprint outrank a new good one', () => {
      const newBad = bp({ ratingCount: 4, ratingAverage: 2, ageDays: 0 });
      const newGood = bp({ ratingCount: 4, ratingAverage: 4.5, downloadCount: 20, ageDays: 0 });
      expect(computeHotScore(newGood)).to.be.greaterThan(computeHotScore(newBad));
    });
  });

  describe('"new but also good" crossover (rotates faster than Top, slower than Newest)', () => {
    // A genuinely great but older blueprint vs a decent brand-new one.
    const oldGreat = bp({ ratingCount: 40, ratingAverage: 4.7, downloadCount: 400, ageDays: 10 });
    const newDecent = bp({ ratingCount: 3, ratingAverage: 4.0, downloadCount: 10, ageDays: 0 });

    it('keeps a great blueprint competitive at ~10 days (not buried like Newest would)', () => {
      // Within striking distance — same order of magnitude, still on the board.
      expect(computeHotScore(oldGreat)).to.be.greaterThan(computeHotScore(newDecent) - 1);
    });

    it('lets fresh content overtake it by the ~2-week window (unlike Top, which never rotates)', () => {
      const veryOldGreat = bp({ ...oldGreat, createdAt: aged(21) });
      expect(computeHotScore(newDecent)).to.be.greaterThan(computeHotScore(veryOldGreat));
    });
  });

  it('is deterministic and independent of the current clock (static per document)', () => {
    const input = bp({ ratingCount: 7, ratingAverage: 4.2, downloadCount: 50, ageDays: 5 });
    expect(computeHotScore(input)).to.equal(computeHotScore(input));
  });
});
