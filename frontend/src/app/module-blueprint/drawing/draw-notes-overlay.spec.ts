import { describe, it, expect } from "vitest";
import {
  BniWorldNote,
  BuildableElement,
  ElementState,
} from "../../../../../lib/index";
import {
  MARKER_URLS,
  parseNoteTintHex,
  stripNoteMarkup,
  noteBadgeColor,
  noteMarkerSprite,
} from "./draw-notes-overlay";

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
