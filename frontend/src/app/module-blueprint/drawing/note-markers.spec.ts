import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTE_SYMBOL,
  NOTE_SYMBOLS,
  isKnownNoteSymbol,
  noteSymbolUrl,
  resolveNoteSymbol,
} from "../../../../../lib/index";

describe("note symbols", () => {
  it("carries the mod's own sprite names as ids (they are wire values)", () => {
    // BlueprintNoteData.Symbol is matched by name against the sprites loaded
    // from the mod's textnote_icons folder — renaming these breaks the game's
    // ability to read a blueprint we wrote.
    expect(NOTE_SYMBOLS).to.include.members([
      "note_info",
      "note_warn",
      "note_question",
      "note_num_0",
      "note_num_9",
    ]);
    expect(NOTE_SYMBOLS).to.have.length(13);
  });

  it("maps an id to the asset shipped under that same name", () => {
    expect(noteSymbolUrl("note_warn")).to.equal(
      "assets/images/notes/symbols/note_warn.png",
    );
  });

  it("treats empty, missing and unknown symbols as the default", () => {
    expect(resolveNoteSymbol(undefined)).to.equal(DEFAULT_NOTE_SYMBOL);
    expect(resolveNoteSymbol("")).to.equal(DEFAULT_NOTE_SYMBOL);
    expect(resolveNoteSymbol("note_from_a_newer_mod")).to.equal(
      DEFAULT_NOTE_SYMBOL,
    );
    expect(resolveNoteSymbol("note_warn")).to.equal("note_warn");
  });

  it("recognises only the icons we ship art for", () => {
    expect(isKnownNoteSymbol("note_num_3")).to.equal(true);
    expect(isKnownNoteSymbol("note_num_10")).to.equal(false);
    expect(isKnownNoteSymbol(undefined)).to.equal(false);
  });
});
