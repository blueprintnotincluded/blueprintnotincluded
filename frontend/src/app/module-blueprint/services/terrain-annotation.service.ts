import { Injectable } from "@angular/core";
import {
  BniTerrainFeature,
  BniWorldNote,
  BuildableElement,
  NEUTRONIUM_ELEMENT_ID,
  TerrainFeature,
  Vector2,
} from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";
import { findNoteAt } from "./world-note.service";

// `BlueprintNoteData.NoteType.Element` — a note that names the element a cell
// should hold, rather than carrying text. The mod writes only id/mass/temp for
// this type (title, text and tint are dropped on save), which is why the base
// carries no explanatory text: it would not survive a round-trip through game.
const ELEMENT_NOTE = 1;

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

// The cells a feature's neutronium base occupies: one row, as wide as the
// footprint, directly beneath the anchor. In the game every geyser, vent and
// volcano is anchored on indestructible neutronium, and this is that row.
//
// The real deposit is often wider — a cell or two off either end, depending on
// the world seed — but that part is unpredictable, so only the subset that is
// always present is drawn.
//
// Pure so the geometry is testable without standing up the renderer.
export function neutroniumBaseCells(feature: BniTerrainFeature): Vector2[] {
  const { width } = terrainFootprint(feature);
  const cells: Vector2[] = [];
  for (let dx = 0; dx < width; dx++)
    cells.push(new Vector2(feature.x + dx, feature.y - 1));
  return cells;
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
    // Both arrays get a new identity, since the overlays cache by identity.
    blueprint.worldNotes = [
      ...blueprint.worldNotes,
      ...this.neutroniumBaseNotes(feature),
    ];
    this.select(feature);
    // One emit for the annotation and its base together, so a placement costs
    // one slot of the 50-entry undo ring rather than five.
    blueprint.emitBlueprintChanged();
  }

  // The neutronium row a placed feature sits on, as element world notes.
  //
  // A note rather than an element cell, because the mod already has a
  // first-class way to say "this cell holds this material" and it survives the
  // round-trip into the game — an element cell is website-only and is dropped
  // from the exported `buildings` array entirely. It also costs nothing new:
  // world notes already render, export, undo and import.
  //
  // Seeded, not owned. Once placed these are ordinary world notes the user
  // edits with the note tool (or deletes) — which is the point, since real
  // terrain rarely matches the default exactly. Deleting the annotation
  // therefore leaves them alone rather than discarding edits the user made.
  private neutroniumBaseNotes(feature: BniTerrainFeature): BniWorldNote[] {
    const blueprint = this.blueprintService.blueprint;

    // A database with no Neutronium simply gets no base rather than a crash.
    const neutronium = BuildableElement.elements?.find(
      (e) => e.id === NEUTRONIUM_ELEMENT_ID,
    );
    if (neutronium == null) return [];

    const notes: BniWorldNote[] = [];
    for (const cell of neutroniumBaseCells(feature)) {
      // Never stack a second note on a cell that already has one: re-placing a
      // feature over its own base must not double up, and a note the user has
      // already customized must win over the default.
      if (findNoteAt(blueprint.worldNotes, cell) != null) continue;

      notes.push({
        x: cell.x,
        y: cell.y,
        type: ELEMENT_NOTE,
        id: neutronium.tag,
        mass: neutronium.defaultMass,
        temp: neutronium.defaultTemperature,
      });
    }
    return notes;
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
