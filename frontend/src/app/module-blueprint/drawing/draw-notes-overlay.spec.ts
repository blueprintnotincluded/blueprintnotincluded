import { describe, it, expect } from "vitest";
import { BniWorldNote, BuildableElement } from "../../../../../lib/index";
import {
  parseNoteTintHex,
  stripNoteMarkup,
  noteBadgeColor,
  resolveNoteContent,
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

describe("resolveNoteContent", () => {
  it("resolves a text note to title + body with a css colour", () => {
    const note: BniWorldNote = {
      x: 15,
      y: 3,
      type: 0,
      title: "important title!",
      text: '<link="X">read me</link>',
      tinthex: "0000FFFF",
    };
    expect(resolveNoteContent(note, noElement)).to.deep.equal({
      kind: "text",
      title: "important title!",
      body: "read me",
      detail: "",
      colorCss: "#0000ff",
      cell: { x: 15, y: 3 },
    });
  });

  it("defaults an empty text-note title to 'Note'", () => {
    const note: BniWorldNote = {
      x: 0,
      y: 0,
      type: 0,
      title: "",
      text: "",
      tinthex: "FFFFFFFF",
    };
    expect(resolveNoteContent(note, noElement).title).to.equal("Note");
  });

  it("resolves an element note to name + mass/temp detail (°C from Kelvin)", () => {
    const note: BniWorldNote = {
      x: 4,
      y: 2,
      type: 1,
      id: -1736594426,
      mass: 791.79,
      temp: 296.15,
    };
    const content = resolveNoteContent(note, (tag) =>
      tag === -1736594426
        ? fakeElement('<link="CUPRITE">Copper Ore</link>', 0xd95e63)
        : undefined,
    );
    expect(content.kind).to.equal("element");
    expect(content.title).to.equal("Copper Ore");
    expect(content.detail).to.equal("791.8 kg · 23 °C");
    expect(content.colorCss).to.equal("#d95e63");
  });

  it("labels an unknown (modded) element gracefully", () => {
    const note: BniWorldNote = {
      x: 1,
      y: 1,
      type: 1,
      id: 999,
      mass: 5,
      temp: 0,
    };
    const content = resolveNoteContent(note, noElement);
    expect(content.title).to.equal("Unknown element");
    expect(content.colorCss).to.equal("#3b82f6");
  });
});
