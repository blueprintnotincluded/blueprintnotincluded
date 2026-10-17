import { BlueprintItem } from './blueprint-item';
import { BlueprintItemElement } from './blueprint-item-element';
import { BniTerrainFeature } from './terrain-metadata';
import { BniDigCommand, BniWorldNote } from '../io/bni/bni-blueprint';
import { TerrainFeature } from '../b-export/b-terrain-feature';
import { Vector2 } from '../vector2';

// What sits on one cell, top to bottom: the answer behind the editor's hover
// card. In the game things stack on a cell and hide what is beneath them, so
// the card lists every one of them. Pure over the blueprint's own data — the
// card's wording and the selection marker are the frontend's business.

// `BlueprintNoteData.NoteType.Element`: a note naming the element a cell
// should hold. It describes the cell's contents, so it lists with the element
// cells at the bottom of the stack, not with the text notes at the top.
const ELEMENT_NOTE = 1;

// Resolves a cell to the note occupying it, last-wins — the same rule the
// canvas click hit-test and the editor overlay's selection use, so a click
// and the panel it opens always agree on which note is "at" a cell. Imports
// are never de-duplicated: a cell with two notes keeps both in the data, but
// only the last one is reachable (spec/element-notes.md §2.1).
export function findNoteAt(
  notes: BniWorldNote[] | null | undefined,
  tile: { x: number; y: number }
): BniWorldNote | null {
  if (notes == null) return null;
  for (let i = notes.length - 1; i >= 0; i--)
    if (notes[i].x === tile.x && notes[i].y === tile.y) return notes[i];
  return null;
}

// Footprint of a placed annotation, in cells. The catalogue is the source of
// truth for size; an id this database doesn't know annotates a single cell, so
// an unrecognised feature is still selectable and deletable rather than
// becoming an invisible, unclickable ghost.
export function terrainFootprint(feature: BniTerrainFeature): {
  width: number;
  height: number;
} {
  const known = TerrainFeature.getFeature(feature.id);
  return known != null ? { width: known.width, height: known.height } : { width: 1, height: 1 };
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
  tile: { x: number; y: number }
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

export type CellStackEntry =
  | { kind: 'note'; ref: BniWorldNote }
  | { kind: 'terrain'; ref: BniTerrainFeature }
  | { kind: 'building'; ref: BlueprintItem }
  | { kind: 'dig'; ref: BniDigCommand }
  | { kind: 'element'; ref: BlueprintItemElement }
  | { kind: 'elementNote'; ref: BniWorldNote };

// The editor's view toggles. A hidden layer is the user saying "not now", so
// its entries are left out too. Buildings have no toggle: an overlay dims a
// building, but it is still on the cell.
export interface CellStackVisibility {
  notes: boolean;
  terrain: boolean;
  digs: boolean;
}

export interface CellStackSource {
  worldNotes: BniWorldNote[];
  terrainFeatures: BniTerrainFeature[];
  digCommands: BniDigCommand[];
  getBlueprintItemsAt(position: Vector2): BlueprintItem[];
}

// Everything on `cell`, in the order it draws on top of itself: text note,
// terrain feature, buildings (every layer, frontmost first — the order the
// Select tool's click cycle walks), dig, then the cell's contents (element
// cells and element notes). An empty cell gives an empty list.
export function cellStack(
  blueprint: CellStackSource,
  cell: { x: number; y: number },
  visibility: CellStackVisibility
): CellStackEntry[] {
  const entries: CellStackEntry[] = [];

  const note = visibility.notes ? findNoteAt(blueprint.worldNotes, cell) : null;
  if (note != null && note.type !== ELEMENT_NOTE) entries.push({ kind: 'note', ref: note });

  if (visibility.terrain) {
    const feature = findTerrainFeatureAt(blueprint.terrainFeatures, cell);
    if (feature != null) entries.push({ kind: 'terrain', ref: feature });
  }

  // Sorted by depth, highest first, as SelectTool.selectFromBox sorts its
  // collections. Array.sort is stable, so equal depths keep insertion order.
  const items = blueprint
    .getBlueprintItemsAt(new Vector2(cell.x, cell.y))
    .slice()
    .sort((a, b) => b.depth - a.depth);
  for (const item of items)
    if (!item.oniItem.isElement) entries.push({ kind: 'building', ref: item });

  if (visibility.digs) {
    const dig = blueprint.digCommands.find(d => d.x === cell.x && d.y === cell.y);
    if (dig != null) entries.push({ kind: 'dig', ref: dig });
  }

  for (const item of items)
    if (item.oniItem.isElement)
      entries.push({ kind: 'element', ref: item as BlueprintItemElement });
  if (note != null && note.type === ELEMENT_NOTE) entries.push({ kind: 'elementNote', ref: note });

  return entries;
}
