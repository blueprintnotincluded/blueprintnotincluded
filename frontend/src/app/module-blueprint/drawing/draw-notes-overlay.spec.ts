import { describe, it, expect } from "vitest";
import { BniWorldNote, BuildableElement } from "../../../../../lib/index";
import {
  parseNoteTintHex,
  stripNoteMarkup,
  prepareWorldNote,
} from "./draw-notes-overlay";

const noElement = () => undefined;
const fakeElement = (name: string, uiColor: number) =>
  ({ name, uiColor }) as BuildableElement;

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

  it("falls back to the default badge colour for junk or missing tint", () => {
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

  it("collapses whitespace and trims", () => {
    expect(stripNoteMarkup("  a\n  b   c ")).to.equal("a b c");
  });

  it("caps overly long text with an ellipsis", () => {
    const out = stripNoteMarkup("x".repeat(80));
    expect(out).to.have.length(40);
    expect(out.endsWith("…")).to.equal(true);
  });
});

describe("prepareWorldNote", () => {
  it("prepares a text note from its tint and title", () => {
    const note: BniWorldNote = {
      x: 15,
      y: 3,
      type: 0,
      title: "important title!",
      text: "body",
      tinthex: "0000FFFF",
    };
    expect(prepareWorldNote(note, noElement)).to.deep.equal({
      x: 15,
      y: 3,
      color: 0x0000ff,
      alpha: 1,
      label: "important title!",
    });
  });

  it("falls back to the note body when there is no title", () => {
    const note: BniWorldNote = {
      x: 0,
      y: 0,
      type: 0,
      text: "body only",
      tinthex: "FFFFFFFF",
    };
    expect(prepareWorldNote(note, noElement).label).to.equal("body only");
  });

  it("colours an element note by the resolved element and labels it by name", () => {
    const note: BniWorldNote = {
      x: 4,
      y: 2,
      type: 1,
      id: -1736594426,
      mass: 791.79,
      temp: 296.15,
    };
    const prepared = prepareWorldNote(note, (tag) =>
      tag === -1736594426
        ? fakeElement('<link="CUPRITE">Copper Ore</link>', 0xd95e63)
        : undefined,
    );
    expect(prepared.color).to.equal(0xd95e63);
    expect(prepared.alpha).to.equal(1);
    expect(prepared.label).to.equal("Copper Ore");
  });

  it("degrades gracefully when the element tag is unknown (modded)", () => {
    const note: BniWorldNote = {
      x: 1,
      y: 1,
      type: 1,
      id: 999,
      mass: 0,
      temp: 0,
    };
    const prepared = prepareWorldNote(note, noElement);
    expect(prepared.color).to.equal(0x3b82f6);
    expect(prepared.label).to.equal("");
  });
});
