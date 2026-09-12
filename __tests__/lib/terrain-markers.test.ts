import { expect } from 'chai';
import {
  activeTileOf,
  BTerrainFeature,
  BniTerrainFeature,
  terrainDisplayName,
  terrainIconPlacement,
  terrainIconUrl,
  TerrainFeature,
} from '../../lib';

// lib/src/drawing/terrain-markers.ts — lifted out of the frontend's
// draw-terrain-overlay.ts so the server preview worker (B1) can draw the same
// footprint/icon geometry without importing from frontend/.

// Offsets as the importer emits them: a geyser erupts from the left of its
// footprint, a volcano from the middle of its 3x3.
const CATALOGUE: BTerrainFeature[] = [
  {
    id: 'GeyserGeneric_steam',
    name: 'Cool Steam Vent',
    width: 2,
    height: 4,
    dlcIds: [],
    activeTile: { x: 0, y: 1 },
  },
  {
    id: 'GeyserGeneric_big_volcano',
    name: 'Volcano',
    width: 3,
    height: 3,
    dlcIds: [],
    activeTile: { x: 1, y: 1 },
    // The real measured rect for this prefab: art overhangs its 3x3 on all four
    // sides, which is exactly what the stretch fallback used to throw away.
    uiImageRect: { x: -0.135, y: -0.575, w: 3.465, h: 3.625 },
  },
  // Deliberately rect-less, to keep the stretch fallback covered.
  {
    id: 'OilWell',
    name: 'Oil Reservoir',
    width: 4,
    height: 2,
    dlcIds: [],
    activeTile: { x: 1, y: 1 },
  },
];

describe('terrain icon/name resolution', function () {
  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
  });

  it('resolves a known feature to its catalogue icon and name', () => {
    const feature: BniTerrainFeature = { id: 'OilWell', x: 0, y: 0 };
    expect(terrainIconUrl(feature)).to.equal('assets/ui_image/OilWell.png');
    expect(terrainDisplayName(feature)).to.equal('Oil Reservoir');
  });

  // Unknown ids are kept, never dropped, so they need a marker and a label.
  it('falls back to a placeholder glyph and the raw id when unknown', () => {
    const feature: BniTerrainFeature = { id: 'SomeModdedGeyser', x: 0, y: 0 };
    expect(terrainIconUrl(feature)).to.equal('assets/images/notes/note.png');
    expect(terrainDisplayName(feature)).to.equal('SomeModdedGeyser');
  });
});

// A feature acts on one cell, not on its whole footprint — and the cell differs
// by kind: a geyser erupts from the LEFT of its footprint, a volcano from the
// middle of its 3x3.
describe('activeTileOf', function () {
  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
  });

  it("puts a geyser's cell on the left column, one row up", () => {
    expect(activeTileOf({ id: 'GeyserGeneric_steam', x: 10, y: 20 })).to.deep.equal({
      x: 10,
      y: 21,
    });
  });

  it("puts a volcano's cell in the middle of its 3x3", () => {
    expect(activeTileOf({ id: 'GeyserGeneric_big_volcano', x: 10, y: 20 })).to.deep.equal({
      x: 11,
      y: 21,
    });
  });

  it('follows a feature into negative coordinates', () => {
    expect(activeTileOf({ id: 'OilWell', x: -3, y: -5 })).to.deep.equal({
      x: -2,
      y: -4,
    });
  });

  it('always lands inside the footprint', () => {
    for (const def of TerrainFeature.features) {
      const active = activeTileOf({ id: def.id, x: 0, y: 0 });
      expect(active.x, def.id).to.be.lessThan(def.width);
      expect(active.y, def.id).to.be.lessThan(def.height);
      expect(active.x, def.id).to.be.at.least(0);
      expect(active.y, def.id).to.be.at.least(0);
    }
  });

  // An unknown id has a single-cell footprint, so its anchor is the only cell
  // it could possibly act on — never an offset outside itself.
  it('uses the anchor itself for an unknown id', () => {
    expect(activeTileOf({ id: 'SomeModdedGeyser', x: 7, y: 8 })).to.deep.equal({
      x: 7,
      y: 8,
    });
  });
});

// Terrain icons are tight-cropped ~200 px/cell renders, so a measured rect is
// what keeps a geyser's plume above its footprint instead of squashed into it.
describe('terrainIconPlacement', function () {
  // Footprint of a 3x3 volcano at cell (10, 20), zoom 10, camera at the origin —
  // the same numbers DrawTerrainOverlay computes before calling the helper.
  const FOOTPRINT = { left: 100, top: -220, width: 30, height: 30 };

  it("places a measured rect relative to the footprint's bottom-left, y-up", () => {
    const rect = { x: -0.135, y: -0.575, w: 3.465, h: 3.625 };
    const p = terrainIconPlacement(
      FOOTPRINT.left,
      FOOTPRINT.top,
      FOOTPRINT.width,
      FOOTPRINT.height,
      rect,
      10
    );
    expect(p.x).to.be.closeTo(98.65, 1e-9);
    expect(p.y).to.be.closeTo(-220.5, 1e-9);
    expect(p.width).to.be.closeTo(34.65, 1e-9);
    expect(p.height).to.be.closeTo(36.25, 1e-9);
  });

  // The default rect is the footprint itself, so a feature whose art happens to
  // fit exactly draws identically either way.
  it('reproduces the footprint for the identity rect', () => {
    const p = terrainIconPlacement(
      FOOTPRINT.left,
      FOOTPRINT.top,
      FOOTPRINT.width,
      FOOTPRINT.height,
      { x: 0, y: 0, w: 3, h: 3 },
      10
    );
    expect(p).to.deep.equal({ x: 100, y: -220, width: 30, height: 30 });
  });

  it('stretches into the footprint, inset, when there is no rect', () => {
    // 4x2 Oil Reservoir at the origin.
    const p = terrainIconPlacement(0, -10, 40, 20, undefined, 10, 0.86);
    expect(p.x).to.be.closeTo(2.8, 1e-9);
    expect(p.y).to.be.closeTo(-8.6, 1e-9);
    expect(p.width).to.be.closeTo(34.4, 1e-9);
    expect(p.height).to.be.closeTo(17.2, 1e-9);
  });
});
