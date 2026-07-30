import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BniTerrainFeature,
  BTerrainFeature,
  CameraService,
  TerrainFeature,
} from "../../../../../lib/index";
import {
  DrawTerrainOverlay,
  terrainDisplayName,
  terrainIconUrl,
} from "./draw-terrain-overlay";
import { DrawPixi } from "./draw-pixi";

const CATALOGUE: BTerrainFeature[] = [
  {
    id: "GeyserGeneric_steam",
    name: "Cool Steam Vent",
    width: 2,
    height: 4,
    dlcIds: [],
  },
  { id: "OilWell", name: "Oil Reservoir", width: 4, height: 2, dlcIds: [] },
];

describe("terrain icon/name resolution", () => {
  beforeEach(() => {
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
  });

  it("resolves a known feature to its catalogue icon and name", () => {
    const feature: BniTerrainFeature = { id: "OilWell", x: 0, y: 0 };
    expect(terrainIconUrl(feature)).to.equal("assets/ui_image/OilWell.png");
    expect(terrainDisplayName(feature)).to.equal("Oil Reservoir");
  });

  // Unknown ids are kept, never dropped, so they need a marker and a label.
  it("falls back to a placeholder glyph and the raw id when unknown", () => {
    const feature: BniTerrainFeature = { id: "SomeModdedGeyser", x: 0, y: 0 };
    expect(terrainIconUrl(feature)).to.equal("assets/images/notes/note.png");
    expect(terrainDisplayName(feature)).to.equal("SomeModdedGeyser");
  });
});

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

  it("clears rather than drawing for an empty or absent set", () => {
    overlay.draw([{ id: "OilWell", x: 0, y: 0 }], camera, null);
    overlay.draw([], camera, null);
    expect(sprites[0].visible).toBe(false);

    // And re-showing after the empty pass still rebuilds.
    overlay.draw([{ id: "OilWell", x: 0, y: 0 }], camera, null);
    expect(sprites[0].visible).toBe(true);
  });
});
