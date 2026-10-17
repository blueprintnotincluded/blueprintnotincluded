import { Injectable } from "@angular/core";
import { CellStackEntry, cellStack } from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";
import { GameStringService } from "./game-string-service";
import { TerrainAnnotationService } from "./terrain-annotation.service";
import { ToolService } from "./tool-service";
import { WorldNoteService } from "./world-note.service";
import {
  HoverCardContent,
  hoverCardContent,
} from "../components/hover-card/hover-card-content";
import { ScreenRect } from "../components/hover-card/hover-card-placement";

export interface HoverCardView extends HoverCardContent {
  // The hovered cell, in viewport pixels: the card is placed beside it.
  cellRect: ScreenRect;
}

// Between the canvas, which knows where the pointer is, and the card, which
// draws what is on that cell. The canvas calls show()/hide(); the card
// listens. Pointer moves arrive outside Angular's zone, so the card renders
// itself when told rather than waiting for an app-wide change detection.
@Injectable({ providedIn: "root" })
export class HoverCardService {
  private tile: { x: number; y: number } | null = null;
  private cellRect: ScreenRect | null = null;
  private listener: ((view: HoverCardView | null) => void) | null = null;

  constructor(
    private blueprintService: BlueprintService,
    private toolService: ToolService,
    private worldNoteService: WorldNoteService,
    private terrainService: TerrainAnnotationService,
    private gameStringService: GameStringService,
  ) {
    // A click that changes the selection moves the orange border, so the
    // card re-renders on the click itself, not on the next tile change.
    this.toolService.selectTool.subscribeSelectionChanged({
      selectionChanged: () => this.refresh(),
    });
  }

  // The card registers here; returns the unregister.
  connect(listener: (view: HoverCardView | null) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  // Describes `tile`. A pointer move within the same cell, with the camera
  // still, is a no-op; `force` re-renders anyway, for a change the tile does
  // not show (a click that moved the selection).
  show(tile: { x: number; y: number }, cellRect: ScreenRect, force = false) {
    if (
      !force &&
      this.tile != null &&
      this.tile.x === tile.x &&
      this.tile.y === tile.y &&
      sameRect(this.cellRect, cellRect)
    )
      return;
    this.tile = { x: tile.x, y: tile.y };
    this.cellRect = cellRect;
    this.render();
  }

  hide() {
    if (this.tile == null) return;
    this.tile = null;
    this.cellRect = null;
    this.listener?.(null);
  }

  // Re-renders the card for the cell it already shows, if any.
  refresh() {
    if (this.tile != null) this.render();
  }

  private render() {
    if (this.tile == null || this.cellRect == null) return;
    const entries = cellStack(this.blueprintService.blueprint, this.tile, {
      notes: this.worldNoteService.visible,
      terrain: this.terrainService.visible,
      digs: this.toolService.digTool.showDigCommands,
    });
    if (entries.length === 0) {
      this.listener?.(null);
      return;
    }
    const content = hoverCardContent(entries, this.tile, {
      isSelected: (entry) => this.isSelected(entry),
      gameString: (key) => this.gameStringService.dict?.[key],
    });
    this.listener?.({ ...content, cellRect: this.cellRect });
  }

  // Whether `entry` is what the canvas's selection highlight belongs to: a
  // building (or element cell) in the selected group of the Select tool, or
  // the selected note or terrain feature. A dig is never selectable.
  private isSelected(entry: CellStackEntry): boolean {
    switch (entry.kind) {
      case "building":
      case "element": {
        const selectTool = this.toolService.selectTool;
        const index = selectTool.currentMultipleSelectionIndex;
        if (index == -1) return false;
        return selectTool.sameItemCollections[index].items.includes(entry.ref);
      }
      case "note":
      case "elementNote":
        return this.worldNoteService.selected === entry.ref;
      case "terrain":
        return this.terrainService.selected === entry.ref;
      case "dig":
        return false;
    }
  }
}

function sameRect(a: ScreenRect | null, b: ScreenRect): boolean {
  return (
    a != null &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}
