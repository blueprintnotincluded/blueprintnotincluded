import { expect } from 'chai';
import {
  AreaOfEffect,
  AREA_OF_EFFECT_GENERATED_CELL_LIMIT,
  dedupeAreasOfEffect,
  Orientation,
  orientAreaOfEffectCell,
  resolveAreaOfEffectCells,
  Vector2,
} from '../../lib';

const base = (partial: Partial<AreaOfEffect>): AreaOfEffect => ({
  kind: 'radiation',
  source: 'test',
  shape: 'ellipse',
  origin: { x: 0, y: 0 },
  blockedBySolids: true,
  ...partial,
});

const pairs = (effect: AreaOfEffect) =>
  resolveAreaOfEffectCells(effect).map(cell => [cell.x, cell.y]);

describe('area-of-effect geometry', () => {
  it('deduplicates complete entries deterministically and preserves first order', () => {
    const first = base({ cells: [[1, 2]], radiusX: 3, radiusY: 4 });
    const duplicateWithDifferentKeyOrder = {
      blockedBySolids: true,
      origin: { y: 0, x: 0 },
      shape: 'ellipse',
      source: 'test',
      radiusY: 4,
      radiusX: 3,
      cells: [[1, 2]],
      kind: 'radiation',
    } as AreaOfEffect;
    const distinct = base({ cells: [[2, 1]], radiusX: 3, radiusY: 4 });
    expect(dedupeAreasOfEffect([first, duplicateWithDifferentKeyOrder, distinct])).to.deep.equal([
      first,
      distinct,
    ]);
  });

  it('prefers exported cells and does not add origin again', () => {
    expect(
      pairs(base({ origin: { x: 50, y: 60 }, cells: [[2, -3]], radiusX: 10, radiusY: 10 }))
    ).to.deep.equal([[2, -3]]);
  });

  it('applies every supported orientation using the game offset convention', () => {
    const cell = new Vector2(2, 3);
    const expected = new Map<Orientation, [number, number]>([
      [Orientation.Neutral, [2, 3]],
      [Orientation.R90, [3, -2]],
      [Orientation.R180, [-2, -3]],
      [Orientation.R270, [-3, 2]],
      [Orientation.FlipH, [-2, 3]],
      [Orientation.FlipV, [2, -3]],
    ]);
    for (const [orientation, pair] of expected) {
      const result = orientAreaOfEffectCell(cell, orientation);
      expect([result.x, result.y], Orientation[orientation]).to.deep.equal(pair);
    }
  });

  it('derives a full ellipse relative to its emitter origin', () => {
    expect(pairs(base({ origin: { x: 4, y: -2 }, radiusX: 1, radiusY: 1 }))).to.have.deep.members([
      [3, -2],
      [4, -3],
      [4, -2],
      [4, -1],
      [5, -2],
    ]);
  });

  it('handles arcs crossing zero degrees and missing arcAngle as a full circle', () => {
    const wrapped = pairs(
      base({ shape: 'ellipseArc', radiusX: 2, radiusY: 2, arcDirection: 350, arcAngle: 40 })
    );
    expect(wrapped).to.deep.include([1, 0]);
    expect(wrapped).not.to.deep.include([-1, 0]);

    const full = pairs(base({ shape: 'ellipseArc', radiusX: 1, radiusY: 1 }));
    expect(full).to.have.length(5);
  });

  it('always includes an ellipse arc emitter cell', () => {
    const cells = pairs(
      base({ shape: 'ellipseArc', radiusX: 2, radiusY: 2, arcDirection: 180, arcAngle: 10 })
    );
    expect(cells).to.deep.include([0, 0]);
    expect(cells).not.to.deep.include([1, 0]);
  });

  it('derives inclusive sky columns with a fixed 25-cell preview height', () => {
    const cells = pairs(
      base({ shape: 'skyColumns', origin: { x: 10, y: 5 }, scanMinX: -1, scanMaxX: 1 })
    );
    expect(cells).to.have.length(75);
    expect(cells).to.deep.include([9, 5]);
    expect(cells).to.deep.include([11, 29]);
  });

  it('accepts unknown cell-bearing entries and skips malformed or unknown params-only ones', () => {
    expect(pairs(base({ kind: 'modKind', shape: 'modShape', cells: [[7, 8]] }))).to.deep.equal([
      [7, 8],
    ]);
    expect(pairs(base({ shape: 'modShape' }))).to.deep.equal([]);
    expect(pairs(base({ radiusX: 0, radiusY: 2 }))).to.deep.equal([]);
  });

  it('enforces the generated-cell safety cap', () => {
    const tooWide = Math.floor(AREA_OF_EFFECT_GENERATED_CELL_LIMIT / 25) + 1;
    expect(pairs(base({ shape: 'skyColumns', scanMinX: 0, scanMaxX: tooWide - 1 }))).to.deep.equal(
      []
    );
  });

  it('filters then caps explicit exported cells', () => {
    const oversized = Array.from(
      { length: AREA_OF_EFFECT_GENERATED_CELL_LIMIT + 10 },
      (_, index): [number, number] => [index, 0]
    );
    const capped = pairs(base({ cells: oversized }));
    expect(capped).to.have.length(AREA_OF_EFFECT_GENERATED_CELL_LIMIT);
    expect(capped[capped.length - 1]).to.deep.equal([AREA_OF_EFFECT_GENERATED_CELL_LIMIT - 1, 0]);

    const invalidThenValid = pairs(
      base({
        cells: [
          ...Array.from(
            { length: AREA_OF_EFFECT_GENERATED_CELL_LIMIT + 1 },
            (): [number, number] => [Number.NaN, 0]
          ),
          [7, 8],
          [9, 10],
        ],
      })
    );
    expect(invalidThenValid).to.deep.equal([
      [7, 8],
      [9, 10],
    ]);
  });
});
