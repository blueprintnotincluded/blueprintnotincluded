import { Injectable } from "@angular/core";
import { BniTerrainFeature, TerrainFeature } from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";

// Footprint of a placed annotation, in cells. The catalogue is the source of
// truth for size; an id this database doesn't know annotates a single cell, so
// an unrecognised feature is still selectable and deletable rather than
// becoming an invisible, unclickable ghost.
export function terrainFootprint(feature: BniTerrainFeature): {
  width: number;
  height: number;
} {
  const known = TerrainFeature.getFeature(feature.id);
  return known != null
    ? { width: known.width, height: known.height }
    : { width: 1, height: 1 };
}

// Resolves a cell to the annotation covering it, last-wins — the same rule the
// canvas hit-test, the tool and the overlay all use, so a click and the panel
// it opens always agree.
//
// Unlike world notes, terrain features occupy an AREA: the stored x/y is the
// bottom-left anchor cell and the footprint extends up and right from it, so a
// click anywhere inside a 4x2 Oil Reservoir selects it.
export function findTerrainFeatureAt(
  features: BniTerrainFeature[] | null | undefined,
  tile: { x: number; y: number },
): BniTerrainFeature | null {
  if (features == null) return null;
  for (let i = features.length - 1; i >= 0; i--) {
    const feature = features[i];
    const { width, height } = terrainFootprint(feature);
    if (
      tile.x >= feature.x &&
      tile.x < feature.x + width &&
      tile.y >= feature.y &&
      tile.y < feature.y + height
    )
      return feature;
  }
  return null;
}

// Shared selection/visibility state for terrain annotations, modelled on
// WorldNoteService: the canvas detects clicks and calls select(), the side
// panel reads `selected` and mutates in place, then calls commit().
//
// Selection is keyed by the anchor cell rather than by object reference, for
// the same reason notes are: annotations round-trip through the MDB/undo model,
// so undo/redo rebuilds the array via importFromMdb and a held reference would
// dangle the moment that happens.
@Injectable({ providedIn: "root" })
export class TerrainAnnotationService {
  private selectedTile: { x: number; y: number } | null = null;

  // "Show terrain annotations" — a clean build view hides the context layer.
  // View state only: hiding never changes what is stored or exported.
  visible = true;

  constructor(private blueprintService: BlueprintService) {}

  get features(): BniTerrainFeature[] {
    return this.blueprintService.blueprint.terrainFeatures;
  }

  get selected(): BniTerrainFeature | null {
    if (this.selectedTile == null) return null;
    return findTerrainFeatureAt(this.features, this.selectedTile);
  }

  // Accepts either a placed annotation (its anchor is read once, not held) or a
  // bare tile. Selecting by the anchor rather than the clicked cell keeps the
  // selection stable when the feature is later moved.
  select(featureOrTile: { x: number; y: number }) {
    this.selectedTile = { x: featureOrTile.x, y: featureOrTile.y };
  }

  clear() {
    this.selectedTile = null;
  }

  toggleVisible() {
    this.visible = !this.visible;
    // Hiding the layer must not leave an invisible thing selected and editable.
    if (!this.visible) this.clear();
  }

  // The single write path for every annotation edit: reassigns terrainFeatures
  // (new array identity, since DrawTerrainOverlay caches by identity) and
  // pushes an undo snapshot. Call once per logical edit, never per drag frame,
  // or a run of small edits floods the 50-entry undo ring.
  commit() {
    const blueprint = this.blueprintService.blueprint;
    blueprint.terrainFeatures = blueprint.terrainFeatures.slice();
    blueprint.emitBlueprintChanged();
  }

  add(feature: BniTerrainFeature) {
    const blueprint = this.blueprintService.blueprint;
    blueprint.terrainFeatures = [...blueprint.terrainFeatures, feature];
    this.select(feature);
    blueprint.emitBlueprintChanged();
  }

  move(feature: BniTerrainFeature, tile: { x: number; y: number }) {
    feature.x = tile.x;
    feature.y = tile.y;
    this.select(feature);
    this.commit();
  }

  delete(feature: BniTerrainFeature) {
    const blueprint = this.blueprintService.blueprint;
    const wasSelected = this.selected === feature;
    blueprint.terrainFeatures = blueprint.terrainFeatures.filter(
      (f) => f !== feature,
    );
    if (wasSelected) this.selectedTile = null;
    blueprint.emitBlueprintChanged();
  }
}
