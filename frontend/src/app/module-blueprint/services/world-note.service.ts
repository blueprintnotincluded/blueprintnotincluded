import { Injectable } from "@angular/core";
import { BniWorldNote } from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";

// Shared selection/edit state for BlueprintsV2 world notes. The canvas detects
// note clicks and calls select(); the bottom-right edit panel reads `selected`
// and mutates the note in place. Mutations to fields the overlay renders
// (badge colour) go through refresh(), which reassigns blueprint.worldNotes so
// DrawNotesOverlay — which caches by array identity — recomputes.
@Injectable({ providedIn: "root" })
export class WorldNoteService {
  selected: BniWorldNote | null = null;

  constructor(private blueprintService: BlueprintService) {}

  select(note: BniWorldNote) {
    this.selected = note;
  }

  clear() {
    this.selected = null;
  }

  get isTextNote(): boolean {
    return this.selected != null && this.selected.type === 0;
  }

  // Force the overlay to re-read notes after an in-place edit. slice() keeps
  // the same note object references, so `selected` stays valid.
  refresh() {
    const blueprint = this.blueprintService.blueprint;
    blueprint.worldNotes = blueprint.worldNotes.slice();
  }

  delete(note: BniWorldNote) {
    const blueprint = this.blueprintService.blueprint;
    blueprint.worldNotes = blueprint.worldNotes.filter((n) => n !== note);
    if (this.selected === note) this.selected = null;
  }
}
