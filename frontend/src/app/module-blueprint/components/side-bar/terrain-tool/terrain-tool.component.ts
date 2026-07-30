import { Component } from "@angular/core";
import {
  BniTerrainFeature,
  TerrainFeature,
} from "../../../../../../../lib/index";
import { TerrainTool } from "../../../common/tools/terrain-tool";
import { TerrainAnnotationService } from "../../../services/terrain-annotation.service";
import {
  terrainDisplayName,
  terrainIconUrl,
} from "../../../drawing/draw-terrain-overlay";

// Left-panel UI for the Terrain Annotation Tool: the palette of natural map
// features to place, plus a detail block for whichever annotation is currently
// selected.
//
// Deliberately separate from the building palette. Dupes cannot build a geyser
// — these record what the map already contains, so mixing them into the build
// menu would invite exactly the confusion this feature exists to avoid.
@Component({
  selector: "app-terrain-tool",
  templateUrl: "./terrain-tool.component.html",
  styleUrls: ["./terrain-tool.component.css"],
  standalone: false,
})
export class TerrainToolComponent {
  constructor(
    public tool: TerrainTool,
    public terrainService: TerrainAnnotationService,
  ) {}

  get features(): TerrainFeature[] {
    return TerrainFeature.features;
  }

  get selected(): BniTerrainFeature | null {
    return this.terrainService.selected;
  }

  // The selected annotation's catalogue entry, or null when its id is one
  // this database doesn't know — a modded feature, or one newer than our export.
  // The template falls back to showing the raw id rather than hiding the thing.
  get selectedDef(): TerrainFeature | null {
    const selected = this.selected;
    if (selected == null) return null;
    return TerrainFeature.getFeature(selected.id) ?? null;
  }

  get selectedName(): string {
    const selected = this.selected;
    return selected != null ? terrainDisplayName(selected) : "";
  }

  get selectedIsUnknown(): boolean {
    return this.selected != null && this.selectedDef === null;
  }

  iconUrl(id: string): string {
    return terrainIconUrl({ id, x: 0, y: 0 });
  }

  footprintLabel(feature: TerrainFeature): string {
    return `${feature.width}×${feature.height}`;
  }
}
