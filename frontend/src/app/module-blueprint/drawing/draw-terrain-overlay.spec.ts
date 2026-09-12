import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BniTerrainFeature,
  BTerrainFeature,
  CameraService,
  TerrainFeature,
} from "../../../../../lib/index";
import { DrawTerrainOverlay } from "./draw-terrain-overlay";
import { DrawPixi } from "./draw-pixi";

// Pure geometry (terrainIconUrl/terrainDisplayName/activeTileOf/
// terrainIconPlacement) moved to lib/src/drawing/terrain-markers.ts and its
// specs to __tests__/lib/terrain-markers.test.ts — the server preview worker
// needs the same answers and cannot import from frontend/. What's left here
// is DrawTerrainOverlay itself: pooling, selection state.

// Offsets as the importer emits them: a geyser erupts from the left of its
// footprint, a volcano from the middle of its 3x3.
const CATALOGUE: BTerrainFeature[] = [
  {
    id: "GeyserGeneric_steam",
    name: "Cool Steam Vent",
    width: 2,
    height: 4,
    dlcIds: [],
    activeTile: { x: 0, y: 1 },
  },
  {
    id: "GeyserGeneric_big_volcano",
    name: "Volcano",
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
    id: "OilWell",
    name: "Oil Reservoir",
    width: 4,
    height: 2,
    dlcIds: [],
    activeTile: { x: 1, y: 1 },
  },
];

// PIXI is always mocked in specs — this is the smallest surface
// DrawTerrainOverlay actually touches.
function makeSprite() {
  return { anchor: { set: vi.fn() }, visible: false, texture: null };
}

function makeDrawPixi() {
  const sprites: ReturnType<typeof makeSprite>[] = [];
  const node = () => ({
    visible: true,
    addChild: vi.fn(),
    clear: vi.fn(),
    beginFill: vi.fn(),
    endFill: vi.fn(),
    lineStyle: vi.fn(),
    drawRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  });
  const drawPixi = {
    pixiApp: { stage: { addChild: vi.fn() } },
    getNewContainer: vi.fn(node),
    getNewGraphics: vi.fn(node),
    getNewBaseTexture: vi.fn((url: string) => `texture:${url}`),
    getSpriteFrom: vi.fn(() => {
      const sprite = makeSprite();
      sprites.push(sprite);
      return sprite;
    }),
  };
  return { drawPixi: drawPixi as unknown as DrawPixi, sprites };
}

const camera = {
  currentZoom: 10,
  cameraOffset: { x: 0, y: 0 },
} as unknown as CameraService;

describe("DrawTerrainOverlay", () => {
  let overlay: DrawTerrainOverlay;
  let sprites: ReturnType<typeof makeSprite>[];

  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
    const made = makeDrawPixi();
    sprites = made.sprites;
    overlay = new DrawTerrainOverlay(made.drawPixi);
  });

  it("creates one pooled sprite per annotation", () => {
    const features: BniTerrainFeature[] = [
      { id: "OilWell", x: 0, y: 0 },
      { id: "GeyserGeneric_steam", x: 6, y: 0 },
    ];
    overlay.draw(features, camera, null);

    expect(sprites).toHaveLength(2);
    expect(sprites.every((s) => s.visible)).toBe(true);
  });

  // Regression: hiding the layer does not change blueprint.terrainFeatures, so
  // re-showing it arrives with the *same* array. If clear() left the cached
  // identity in place, draw() would skip syncSprites() and the icons would stay
  // hidden — dashed outlines with nothing inside them.
  it("restores its icons when the same feature array is shown again", () => {
    const features: BniTerrainFeature[] = [{ id: "OilWell", x: 0, y: 0 }];

    overlay.draw(features, camera, null);
    expect(sprites[0].visible).toBe(true);

    overlay.clear();
    expect(sprites[0].visible).toBe(false);

    overlay.draw(features, camera, null);
    expect(sprites[0].visible).toBe(true);
  });

  it("hides surplus sprites instead of orphaning them when the set shrinks", () => {
    const two: BniTerrainFeature[] = [
      { id: "OilWell", x: 0, y: 0 },
      { id: "OilWell", x: 6, y: 0 },
    ];
    overlay.draw(two, camera, null);
    expect(sprites).toHaveLength(2);

    overlay.draw([{ id: "OilWell", x: 0, y: 0 }], camera, null);
    expect(sprites).toHaveLength(2);
    expect(sprites[0].visible).toBe(true);
    expect(sprites[1].visible).toBe(false);
  });

  // The overlay has to hand the catalogue's rect to the placement helper, not
  // just fill the footprint — otherwise the icons regress to squashed and
  // shifted the moment the export starts shipping tight-cropped renders.
  it("draws a rect-carrying feature at its measured placement", () => {
    overlay.draw(
      [{ id: "GeyserGeneric_big_volcano", x: 10, y: 20 }],
      camera,
      null,
    );

    const sprite = sprites[0] as unknown as {
      x: number;
      y: number;
      width: number;
      height: number;
      anchor: { set: ReturnType<typeof vi.fn> };
    };
    // Top-left anchored, since a measured rect is not centred on the footprint.
    expect(sprite.anchor.set).toHaveBeenCalledWith(0, 0);
    expect(sprite.x).toBeCloseTo(98.65);
    expect(sprite.y).toBeCloseTo(-220.5);
    expect(sprite.width).toBeCloseTo(34.65);
    expect(sprite.height).toBeCloseTo(36.25);
  });

  it("falls back to an inset footprint stretch for a feature with no rect", () => {
    overlay.draw([{ id: "OilWell", x: 0, y: 0 }], camera, null);

    const sprite = sprites[0] as unknown as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    expect(sprite.x).toBeCloseTo(2.8);
    expect(sprite.y).toBeCloseTo(-8.6);
    expect(sprite.width).toBeCloseTo(34.4);
    expect(sprite.height).toBeCloseTo(17.2);
  });

  it("clears rather than drawing for an empty or absent set", () => {
    overlay.draw([{ id: "OilWell", x: 0, y: 0 }], camera, null);
    overlay.draw([], camera, null);
    expect(sprites[0].visible).toBe(false);

    // And re-showing after the empty pass still rebuilds.
    overlay.draw([{ id: "OilWell", x: 0, y: 0 }], camera, null);
    expect(sprites[0].visible).toBe(true);
  });
});
