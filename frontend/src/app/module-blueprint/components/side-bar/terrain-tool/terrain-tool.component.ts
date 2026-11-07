import { Component } from "@angular/core";
import {
  TerrainFeature,
  TerrainFeatureKind,
} from "../../../../../../../lib/index";
import { TerrainTool } from "../../../common/tools/terrain-tool";
import { TerrainAnnotationService } from "../../../services/terrain-annotation.service";

// Left-panel UI for the Terrain Annotation Tool: the palette of natural map
// features to place, split into two tabs — geysers/vents/volcanoes and wild
// plants/trees — because they share a storage model, not a mental one. The
// selected annotation is shown and deleted from TerrainEditPanelComponent
// instead, since a feature can be selected from any tool and this card is only
// visible while the Terrain tool is active.
//
// Deliberately separate from the building palette. Dupes cannot build a geyser
// or plant a wild tree — these record what the map already contains, so mixing
// them into the build menu would invite exactly the confusion this feature
// exists to avoid.
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

  // Which tab is open. Follows the tool's current feature, so reopening the
  // card after placing a plant lands on the Plants tab, and picking a tab
  // moves the tool onto a feature of that kind so the next click places one.
  get kind(): TerrainFeatureKind {
    return this.tool.feature?.kind ?? "terrain";
  }

  showKind(kind: TerrainFeatureKind) {
    if (this.kind === kind) return;
    const first = TerrainFeature.byKind(kind)[0];
    if (first != null) this.tool.featureId = first.id;
  }

  get features(): TerrainFeature[] {
    return TerrainFeature.byKind(this.kind);
  }

  get hasPlants(): boolean {
    return TerrainFeature.byKind("plant").length > 0;
  }

  footprintLabel(feature: TerrainFeature): string {
    return `${feature.width}×${feature.height}`;
  }
}
