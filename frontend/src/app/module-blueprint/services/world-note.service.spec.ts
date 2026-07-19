import { describe, it, expect, beforeEach } from "vitest";
import { BniWorldNote } from "../../../../../lib/index";
import { WorldNoteService } from "./world-note.service";
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

describe("WorldNoteService", () => {
  let service: WorldNoteService;
  let blueprint: { worldNotes: BniWorldNote[] };

  beforeEach(() => {
    blueprint = { worldNotes: [] };
    service = new WorldNoteService({
      blueprint,
    } as unknown as BlueprintService);
  });

  it("selects and clears a note", () => {
    const n = textNote(1);
    service.select(n);
    expect(service.selected).to.equal(n);
    service.clear();
    expect(service.selected).to.equal(null);
  });

  it("reports isTextNote for the selected note only", () => {
    expect(service.isTextNote).to.equal(false);
    service.select(textNote(1));
    expect(service.isTextNote).to.equal(true);
    service.select(elementNote(2));
    expect(service.isTextNote).to.equal(false);
  });

  it("refresh reassigns worldNotes (new identity) but keeps note references", () => {
    const notes = [textNote(1), textNote(2)];
    blueprint.worldNotes = notes;
    service.refresh();
    expect(blueprint.worldNotes).to.not.equal(notes);
    expect(blueprint.worldNotes).to.deep.equal(notes);
    expect(blueprint.worldNotes[0]).to.equal(notes[0]);
  });

  it("delete removes the note and clears it if selected", () => {
    const a = textNote(1);
    const b = textNote(2);
    blueprint.worldNotes = [a, b];
    service.select(a);
    service.delete(a);
    expect(blueprint.worldNotes).to.deep.equal([b]);
    expect(service.selected).to.equal(null);
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
