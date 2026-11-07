import { Component } from "@angular/core";
import {
  activeTileOf,
  BniTerrainFeature,
  terrainDisplayName,
  terrainThumbUrl,
  TerrainFeature,
} from "../../../../../../lib/index";
import {
  TerrainAnnotationService,
  terrainFootprint,
} from "../../services/terrain-annotation.service";
import { ToolService } from "../../services/tool-service";
import { ToolType } from "../../common/tools/tool";
import { KeybindingService } from "../../services/keybinding.service";
import { ShortcutAction } from "../../keybindings/shortcut-actions";

// The one place a selected terrain annotation (geyser, vent, volcano, or a
// wild plant) is shown and acted on, pinned bottom-right the way the note edit
// panel is.
//
// A feature can be selected from ANY tool — clicking one on the canvas
// selects it whether the user is on Select, Build or Terrain — so its controls
// cannot live in the Terrain tool's left-hand card: from the Select tool that
// card is hidden, and the only sign of the selection was a highlighted cell on
// the canvas with nothing saying what to do with it. This panel follows the
// selection instead, so "can I delete it?" is answered by a button on screen
// rather than by knowing the Delete key works here too.
@Component({
  selector: "app-terrain-edit-panel",
  templateUrl: "./terrain-edit-panel.component.html",
  styleUrls: ["./terrain-edit-panel.component.css"],
  standalone: false,
})
export class TerrainEditPanelComponent {
  constructor(
    public terrainService: TerrainAnnotationService,
    private toolService: ToolService,
    private keybindings: KeybindingService,
  ) {}

  // "Delete feature (Del)": the editor's one delete, named with the user's
  // key for it rather than a key written into the prose.
  get deleteLabel(): string {
    return this.keybindings.withHint(
      $localize`:terrain panel button:Delete feature`,
      ShortcutAction.editDelete,
    );
  }

  get feature(): BniTerrainFeature | null {
    return this.terrainService.selected;
  }

  // The catalogue entry, or null when the id is one this database doesn't
  // know — a modded feature, or one newer than our export. The panel still
  // shows the raw id and still offers Delete: an unrecognised annotation must
  // not become an immovable ghost.
  get def(): TerrainFeature | null {
    const feature = this.feature;
    if (feature == null) return null;
    return TerrainFeature.getFeature(feature.id) ?? null;
  }

  get name(): string {
    const feature = this.feature;
    return feature != null ? terrainDisplayName(feature) : "";
  }

  get isUnknown(): boolean {
    return this.feature != null && this.def === null;
  }

  // Drives the wording: "Terrain Feature" vs "Plant", and which hint applies.
  get isPlant(): boolean {
    return this.def?.isPlant === true;
  }

  get iconUrl(): string {
    const feature = this.feature;
    return feature != null
      ? terrainThumbUrl({ id: feature.id, x: 0, y: 0 })
      : "";
  }

  get footprintLabel(): string {
    const feature = this.feature;
    if (feature == null) return "";
    const { width, height } = terrainFootprint(feature);
    return `${width}×${height}`;
  }

  // The one cell the feature acts on — where it erupts. That, not the anchor,
  // is the coordinate someone planning a pump around it cares about. Null for
  // a plant, which erupts nowhere, so the template shows no such line.
  get activeTile(): { x: number; y: number } | null {
    const feature = this.feature;
    return feature != null ? activeTileOf(feature) : null;
  }

  deleteFeature() {
    const feature = this.feature;
    if (feature != null) this.terrainService.delete(feature);
  }

  // Closing just drops the selection; the user stays on whatever tool they
  // were using when they clicked the feature.
  close() {
    this.terrainService.clear();
  }

  // The palette for placing more lives on the Terrain tool, which someone who
  // only ever clicked an existing geyser may not have found yet.
  openTerrainTool() {
    this.toolService.changeTool(ToolType.terrain);
  }
}
