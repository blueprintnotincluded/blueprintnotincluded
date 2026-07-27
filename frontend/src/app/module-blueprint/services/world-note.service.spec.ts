import { describe, it, expect, beforeEach } from "vitest";
import { BniWorldNote } from "../../../../../lib/index";
import { WorldNoteService, findNoteAt } from "./world-note.service";
import { BlueprintService } from "./blueprint-service";

const textNote = (x: number): BniWorldNote => ({
  x,
  y: 0,
  type: 0,
  title: "t",
  text: "b",
  tinthex: "ffffffff",
});
const elementNote = (x: number): BniWorldNote => ({
  x,
  y: 0,
  type: 1,
  id: 1,
  mass: 1,
  temp: 300,
});

describe("findNoteAt", () => {
  it("resolves last-wins when two notes share a cell", () => {
    const a: BniWorldNote = { x: 1, y: 1, type: 0, title: "first" };
    const b: BniWorldNote = { x: 1, y: 1, type: 0, title: "second" };
    expect(findNoteAt([a, b], { x: 1, y: 1 })).to.equal(b);
  });

  it("returns null for an empty cell or a null/undefined note list", () => {
    expect(findNoteAt([textNote(1)], { x: 5, y: 5 })).to.equal(null);
    expect(findNoteAt(null, { x: 0, y: 0 })).to.equal(null);
    expect(findNoteAt(undefined, { x: 0, y: 0 })).to.equal(null);
  });
});

describe("WorldNoteService", () => {
  let service: WorldNoteService;
  let blueprint: {
    worldNotes: BniWorldNote[];
    emitBlueprintChanged: () => void;
  };
  let emitCount: number;

  beforeEach(() => {
    emitCount = 0;
    blueprint = {
      worldNotes: [],
      emitBlueprintChanged: () => {
        emitCount++;
      },
    };
    service = new WorldNoteService({
      blueprint,
    } as unknown as BlueprintService);
  });

  it("selects a note already in the blueprint and clears it", () => {
    const n = textNote(1);
    blueprint.worldNotes = [n];
    service.select(n);
    expect(service.selected).to.equal(n);
    service.clear();
    expect(service.selected).to.equal(null);
  });

  it("selection is keyed by cell, not by object reference", () => {
    const n = textNote(1);
    blueprint.worldNotes = [n];
    service.select({ x: 1, y: 0 });
    expect(service.selected).to.equal(n);
  });

  it("selection survives an undo/redo that rebuilds the note array", () => {
    const original = textNote(3);
    blueprint.worldNotes = [original];
    service.select(original);

    // importFromMdb-style rebuild: a brand new array with a brand new note
    // object at the same cell (undo/redo never reuses the old objects).
    const rebuilt: BniWorldNote = { ...original };
    blueprint.worldNotes = [rebuilt];

    expect(service.selected).to.equal(rebuilt);
    expect(service.selected).to.not.equal(original);
  });

  it("selected resolves to null once the selected cell is empty", () => {
    const n = textNote(1);
    blueprint.worldNotes = [n];
    service.select(n);
    blueprint.worldNotes = [];
    expect(service.selected).to.equal(null);
  });

  it("reports isTextNote for the selected note only", () => {
    const text = textNote(1);
    const element = elementNote(2);
    blueprint.worldNotes = [text, element];

    expect(service.isTextNote).to.equal(false);
    service.select(text);
    expect(service.isTextNote).to.equal(true);
    service.select(element);
    expect(service.isTextNote).to.equal(false);
  });

  it("commit reassigns worldNotes (new identity, same note references) and emits a change", () => {
    const notes = [textNote(1), textNote(2)];
    blueprint.worldNotes = notes;
    service.commit();
    expect(blueprint.worldNotes).to.not.equal(notes);
    expect(blueprint.worldNotes).to.deep.equal(notes);
    expect(blueprint.worldNotes[0]).to.equal(notes[0]);
    expect(emitCount).to.equal(1);
  });

  it("delete removes the note, clears it if selected, and emits a change", () => {
    const a = textNote(1);
    const b = textNote(2);
    blueprint.worldNotes = [a, b];
    service.select(a);
    service.delete(a);
    expect(blueprint.worldNotes).to.deep.equal([b]);
    expect(service.selected).to.equal(null);
    expect(emitCount).to.equal(1);
  });

  it("delete of a non-selected note leaves the selection intact", () => {
    const a = textNote(1);
    const b = textNote(2);
    blueprint.worldNotes = [a, b];
    service.select(a);
    service.delete(b);
    expect(blueprint.worldNotes).to.deep.equal([a]);
    expect(service.selected).to.equal(a);
  });
});
