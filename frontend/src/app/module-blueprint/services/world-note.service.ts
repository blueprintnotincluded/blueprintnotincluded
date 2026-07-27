import { Injectable } from "@angular/core";
import { BniWorldNote } from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";

// Resolves a cell to the note occupying it, last-wins — the same rule the
// canvas click hit-test and the editor overlay's selection use, so a click
// and the panel it opens always agree on which note is "at" a cell. Imports
// are never de-duplicated: a cell with two notes keeps both in the data, but
// only the last one is reachable (spec/element-notes.md §2.1).
export function findNoteAt(
  notes: BniWorldNote[] | null | undefined,
  tile: { x: number; y: number },
): BniWorldNote | null {
  if (notes == null) return null;
  for (let i = notes.length - 1; i >= 0; i--)
    if (notes[i].x === tile.x && notes[i].y === tile.y) return notes[i];
  return null;
}

// Shared selection/edit state for BlueprintsV2 world notes. The canvas
// detects note clicks and calls select(); the bottom-right edit panel reads
// `selected` and mutates the note in place, then calls commit().
//
// Selection is keyed by cell, not by object reference. World notes now round-
// trip through the normal MDB/undo model, so undo/redo rebuilds the note
// array via importFromMdb — a held object reference would dangle the moment
// that happens. `selected` re-resolves the note at the remembered cell on
// every read instead.
@Injectable({ providedIn: "root" })
export class WorldNoteService {
  private selectedTile: { x: number; y: number } | null = null;

  constructor(private blueprintService: BlueprintService) {}

  get selected(): BniWorldNote | null {
    if (this.selectedTile == null) return null;
    return findNoteAt(
      this.blueprintService.blueprint.worldNotes,
      this.selectedTile,
    );
  }

  // Accepts either a note (its x/y are read once, not held onto) or a bare
  // tile — creation selects a freshly pushed note by reference, the canvas
  // hit-test passes a resolved note, and a future create flow can pass a tile.
  select(noteOrTile: { x: number; y: number }) {
    this.selectedTile = { x: noteOrTile.x, y: noteOrTile.y };
  }

  clear() {
    this.selectedTile = null;
  }

  get isTextNote(): boolean {
    return this.selected != null && this.selected.type === 0;
  }

  // The single write path for every note edit: reassigns worldNotes (new
  // array identity, since DrawNotesOverlay caches by identity) and pushes an
  // undo snapshot. Call once per logical edit — blur/Enter for text fields,
  // slider end rather than every drag frame — never per keystroke, or a run
  // of small edits floods the 50-entry undo ring (spec §3, §12).
  commit() {
    const blueprint = this.blueprintService.blueprint;
    blueprint.worldNotes = blueprint.worldNotes.slice();
    blueprint.emitBlueprintChanged();
  }

  delete(note: BniWorldNote) {
    const blueprint = this.blueprintService.blueprint;
    const wasSelected =
      this.selectedTile != null &&
      this.selectedTile.x === note.x &&
      this.selectedTile.y === note.y;
    blueprint.worldNotes = blueprint.worldNotes.filter((n) => n !== note);
    if (wasSelected) this.selectedTile = null;
    blueprint.emitBlueprintChanged();
  }
}
