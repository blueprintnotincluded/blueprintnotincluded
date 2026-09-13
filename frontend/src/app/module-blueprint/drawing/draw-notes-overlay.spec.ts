import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BniWorldNote,
  BuildableElement,
  CameraService,
  ElementState,
  NEUTRONIUM_DISPLAY_COLOR,
  NEUTRONIUM_ELEMENT_ID,
  Overlay,
} from "../../../../../lib/index";
import {
  MARKER_URLS,
  parseNoteTintHex,
  stripNoteMarkup,
  noteBadgeColor,
  noteMarkerSprite,
  noteOverlayAlpha,
} from "../../../../../lib/index";
import { DrawNotesOverlay } from "./draw-notes-overlay";
import { DrawPixi } from "./draw-pixi";

const noElement = () => undefined;
const fakeElement = (name: string, uiColor: number, state?: ElementState) =>
  ({ name, uiColor, state }) as BuildableElement;

describe("parseNoteTintHex", () => {
  it("splits RRGGBBAA into a PIXI colour and 0..1 alpha", () => {
    expect(parseNoteTintHex("0000FFFF")).to.deep.equal({
      color: 0x0000ff,
      alpha: 1,
    });
    const half = parseNoteTintHex("FF000080");
    expect(half.color).to.equal(0xff0000);
    expect(half.alpha).to.be.closeTo(128 / 255, 1e-6);
  });

  it("accepts RRGGBB without an alpha byte", () => {
    expect(parseNoteTintHex("00ff00")).to.deep.equal({
      color: 0x00ff00,
      alpha: 1,
    });
  });

  it("falls back to the default badge colour for junk or bad-length tint", () => {
    for (const bad of [undefined, "", "xyz", "12345", "1234567", "123456789"])
      expect(parseNoteTintHex(bad as string)).to.deep.equal({
        color: 0x3b82f6,
        alpha: 1,
      });
  });
});

describe("stripNoteMarkup", () => {
  it("removes ONI rich-text markup (spec §7 gotcha 2)", () => {
    expect(stripNoteMarkup('<link="CUPRITE">Copper Ore</link>')).to.equal(
      "Copper Ore",
    );
  });

  it("collapses whitespace and trims but keeps full length", () => {
    expect(stripNoteMarkup("  a\n  b   c ")).to.equal("a b c");
    const long = "x".repeat(80);
    expect(stripNoteMarkup(long)).to.equal(long);
  });
});

describe("noteBadgeColor", () => {
  it("tints a text note by its hex tint", () => {
    const note: BniWorldNote = {
      x: 0,
      y: 0,
      type: 0,
      title: "t",
      text: "b",
      tinthex: "0000FFFF",
    };
    expect(noteBadgeColor(note, noElement)).to.deep.equal({
      color: 0x0000ff,
      alpha: 1,
    });
  });

  it("tints an element note by the resolved element uiColor, default when unknown", () => {
    const note: BniWorldNote = { x: 4, y: 2, type: 1, id: 7, mass: 0, temp: 0 };
    expect(
      noteBadgeColor(note, (t) =>
        t === 7 ? fakeElement("Copper Ore", 0xd95e63) : undefined,
      ).color,
    ).to.equal(0xd95e63);
    expect(noteBadgeColor(note, noElement).color).to.equal(0x3b82f6);
  });

  // Neutronium's exported uiColor is a placeholder magenta the game never
  // shows, and the terrain tool seeds a row of these under every feature — so
  // the badge takes the same near-black override the element's cells do.
  it("overrides Neutronium's placeholder uiColor with its display colour", () => {
    const note: BniWorldNote = { x: 0, y: 0, type: 1, id: 9, mass: 0, temp: 0 };
    const neutronium = {
      id: NEUTRONIUM_ELEMENT_ID,
      name: "Neutronium",
      uiColor: 0xff00ff,
      state: ElementState.Solid,
    } as BuildableElement;

    expect(
      noteBadgeColor(note, (t) => (t === 9 ? neutronium : undefined)),
    ).to.deep.equal({ color: NEUTRONIUM_DISPLAY_COLOR, alpha: 1 });
  });
});

describe("noteMarkerSprite", () => {
  const elementNote = (id: number): BniWorldNote => ({
    x: 0,
    y: 0,
    type: 1,
    id,
    mass: 0,
    temp: 0,
  });

  it("uses the plain note marker for a text note that names no icon", () => {
    const note: BniWorldNote = { x: 0, y: 0, type: 0, title: "t" };
    expect(noteMarkerSprite(note, noElement)).to.equal("note");
    expect(noteMarkerSprite({ ...note, symbol: "" }, noElement)).to.equal(
      "note",
    );
  });

  it("uses the icon a text note names", () => {
    const note: BniWorldNote = { x: 0, y: 0, type: 0, symbol: "note_warn" };
    expect(noteMarkerSprite(note, noElement)).to.equal("note_warn");
    expect(MARKER_URLS["note_warn"]).to.contain("symbols/note_warn.png");
  });

  it("falls back to the plain marker for an icon we don't ship", () => {
    // A newer mod build, or a hand-edited blueprint: render something rather
    // than nothing, same as the mod's own GetNoteSprite fallback.
    const note: BniWorldNote = { x: 0, y: 0, type: 0, symbol: "note_alien" };
    expect(noteMarkerSprite(note, noElement)).to.equal("note");
  });

  it("picks the state marker for a resolved element", () => {
    const resolve = (state: ElementState) => (t: number) =>
      t === 1 ? fakeElement("e", 0, state) : undefined;
    expect(
      noteMarkerSprite(elementNote(1), resolve(ElementState.Solid)),
    ).to.equal("solid");
    expect(
      noteMarkerSprite(elementNote(1), resolve(ElementState.Liquid)),
    ).to.equal("liquid");
    expect(
      noteMarkerSprite(elementNote(1), resolve(ElementState.Gas)),
    ).to.equal("gas");
  });

  it("falls back to the note marker for Vacuum or an unresolved element", () => {
    expect(
      noteMarkerSprite(elementNote(1), (t) =>
        t === 1 ? fakeElement("e", 0, ElementState.Vacuum) : undefined,
      ),
    ).to.equal("note");
    expect(noteMarkerSprite(elementNote(99), noElement)).to.equal("note");
  });
});

describe("noteOverlayAlpha", () => {
  const gasElement = () =>
    ({ hasTag: (t: string) => t === "Gas" }) as unknown as BuildableElement;
  const liquidElement = () =>
    ({ hasTag: (t: string) => t === "Liquid" }) as unknown as BuildableElement;

  it("keeps a text note opaque in every overlay — it's an annotation, never obscured by a physical overlay", () => {
    const note: BniWorldNote = { x: 0, y: 0, type: 0, title: "t" };
    for (const overlay of [Overlay.Base, Overlay.Power, Overlay.Gas])
      expect(noteOverlayAlpha(note, overlay, noElement)).to.equal(1);
  });

  it("fades an element note exactly like the matching element cell would", () => {
    const note: BniWorldNote = { x: 0, y: 0, type: 1, id: 1, mass: 0, temp: 0 };
    const resolve = () => gasElement();
    expect(noteOverlayAlpha(note, Overlay.Base, resolve)).to.equal(1);
    expect(noteOverlayAlpha(note, Overlay.Gas, resolve)).to.equal(1);
    expect(noteOverlayAlpha(note, Overlay.Liquid, resolve)).to.equal(0.3);
    expect(noteOverlayAlpha(note, Overlay.Power, resolve)).to.equal(0.3);
  });

  it("does not fade a liquid element note while in the Gas overlay", () => {
    const note: BniWorldNote = { x: 0, y: 0, type: 1, id: 2, mass: 0, temp: 0 };
    const resolve = () => liquidElement();
    expect(noteOverlayAlpha(note, Overlay.Liquid, resolve)).to.equal(1);
    expect(noteOverlayAlpha(note, Overlay.Gas, resolve)).to.equal(0.3);
  });

  it("stays opaque for an id it can't resolve, rather than fading for a reason the viewer can't see", () => {
    const note: BniWorldNote = {
      x: 0,
      y: 0,
      type: 1,
      id: 99,
      mass: 0,
      temp: 0,
    };
    expect(noteOverlayAlpha(note, Overlay.Power, noElement)).to.equal(1);
  });
});

// PIXI is always mocked in specs — this is the smallest surface
// DrawNotesOverlay actually touches.
function makeSprite() {
  return {
    anchor: { set: vi.fn() },
    visible: false,
    texture: null,
    tint: 0,
    alpha: 1,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  };
}

function makeDrawPixi() {
  const sprites: ReturnType<typeof makeSprite>[] = [];
  const node = () => ({
    visible: true,
    addChild: vi.fn(),
    clear: vi.fn(),
    lineStyle: vi.fn(),
    drawCircle: vi.fn(),
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

const cameraWithOverlay = (overlay: Overlay) =>
  ({
    currentZoom: 10,
    cameraOffset: { x: 0, y: 0 },
    overlay,
  }) as unknown as CameraService;

describe("DrawNotesOverlay overlay-aware alpha", () => {
  beforeEach(() => {
    BuildableElement.init();
    BuildableElement.elements = [
      Object.assign(new BuildableElement(), {
        id: "Oxygen",
        tag: 1,
        oreTags: ["Gas"],
        uiColor: 0x123456,
      }),
    ];
  });

  // Regression: saveImages() draws one shared DrawNotesOverlay instance across
  // several exported overlays with the same (unchanged) note array — if the
  // per-note alpha were baked into the marker/colour cache alongside it, only
  // the first exported overlay's alpha would ever be applied.
  it("re-fades the marker every frame as the overlay changes, without needing the note array to change", () => {
    const made = makeDrawPixi();
    const overlay = new DrawNotesOverlay(made.drawPixi);
    const notes: BniWorldNote[] = [
      { x: 0, y: 0, type: 1, id: 1, mass: 1, temp: 300 },
    ];

    overlay.draw(notes, cameraWithOverlay(Overlay.Base), null);
    expect(made.sprites[0].alpha).to.equal(1);

    overlay.draw(notes, cameraWithOverlay(Overlay.Power), null);
    expect(made.sprites[0].alpha).to.be.closeTo(0.3, 1e-9);

    overlay.draw(notes, cameraWithOverlay(Overlay.Gas), null);
    expect(made.sprites[0].alpha).to.equal(1);
  });

  it("keeps a text note fully opaque in every overlay", () => {
    const made = makeDrawPixi();
    const overlay = new DrawNotesOverlay(made.drawPixi);
    const notes: BniWorldNote[] = [
      { x: 0, y: 0, type: 0, title: "t", tinthex: "ffffffff" },
    ];

    overlay.draw(notes, cameraWithOverlay(Overlay.Power), null);
    expect(made.sprites[0].alpha).to.equal(1);
  });

  it("clear() hides the layer", () => {
    const made = makeDrawPixi();
    const overlay = new DrawNotesOverlay(made.drawPixi);
    const notes: BniWorldNote[] = [
      { x: 0, y: 0, type: 0, title: "t", tinthex: "ffffffff" },
    ];

    overlay.draw(notes, cameraWithOverlay(Overlay.Base), null);
    overlay.clear();

    expect((overlay as any).container.visible).toBe(false);
  });
});
