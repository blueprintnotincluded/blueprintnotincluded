// Room detection over a Blueprint: find enclosed cavities (flood fill), extract
// per-cavity building features, evaluate the declarative rule table. Pure and
// deterministic — the same module runs client-side (editor overlay, save dialog)
// and server-side (save-path derivation, backfill). Spec: spec/rooms.md.

import { Blueprint } from '../blueprint';
import { OniItem } from '../../oni-item';
import { DrawHelpers } from '../../drawing/draw-helpers';
import { Vector2 } from '../../vector2';
import {
  MAX_DETECTION_AREA,
  MAX_ROOM_SIZE,
  ROOM_BOUNDARY_DOORS,
  ROOM_DEFINITIONS,
  RoomConstraint,
  RoomTypeDefinition,
  RoomTypeId,
} from './room-definitions';

export interface RoomDetectorOptions {
  // Overrides for tests; production callers use the defaults.
  maxDetectionArea?: number;
  maxRoomSize?: number;
}

export interface DetectedRoom {
  type: RoomTypeId;
  // Set when the tier above `type` also matched but the game gates it on data
  // blueprints can't represent (park → natureReserve, see room-definitions).
  possibleUpgrade?: RoomTypeId;
  cavityId: number;
  cells: number[]; // tileIndexes (DrawHelpers.getTileIndex convention)
  size: number;
}

export interface Cavity {
  id: number;
  cells: number[]; // tileIndexes
  size: number;
  result: 'room' | 'miscellaneous' | 'conflict' | 'too-large-for-room';
  matchedTypes: RoomTypeId[]; // post-collapse candidates (conflict diagnostics)
}

export interface RoomDetectionResult {
  status: 'ok' | 'too-large' | 'empty';
  rooms: DetectedRoom[];
  cavities: Cavity[];
}

// Features accumulated per cavity for constraint evaluation.
interface CavityFeatures {
  tagCounts: Map<string, number>;
  prefabCounts: Map<string, number>;
  nonLuxuryBedCount: number;
  bboxHeight: number;
  backwallCells: number; // cavity cells covered by an objectLayer-2 building
}

const OUTSIDE = -1;
const UNVISITED = -2;

export function detectRooms(
  blueprint: Blueprint,
  options?: RoomDetectorOptions
): RoomDetectionResult {
  const maxDetectionArea = options?.maxDetectionArea ?? MAX_DETECTION_AREA;
  const maxRoomSize = options?.maxRoomSize ?? MAX_ROOM_SIZE;

  const items = blueprint.blueprintItems ?? [];
  if (items.length === 0) return { status: 'empty', rooms: [], cavities: [] };

  // --- Bounding box (world cells, from item footprints) ---
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    for (const tileIndex of item.tileIndexes) {
      const p = DrawHelpers.getTilePosition(tileIndex);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (minX === Infinity) return { status: 'empty', rooms: [], cavities: [] };

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w * h > maxDetectionArea) return { status: 'too-large', rooms: [], cavities: [] };

  // Grid with a one-cell border ring so "outside" is a single connected region.
  const gw = w + 2;
  const gh = h + 2;
  const toGrid = (tileIndex: number): number => {
    const p = DrawHelpers.getTilePosition(tileIndex);
    return p.x - minX + 1 + (p.y - minY + 1) * gw;
  };

  // --- Cell classification ---
  const boundary = new Uint8Array(gw * gh); // tiles + doors bound rooms
  const backwall = new Uint8Array(gw * gh); // objectLayer-2 coverage (drywall etc.)
  for (const item of items) {
    const isBoundary = isRoomBoundary(item.oniItem);
    const isBackwall = item.oniItem.objectLayer === OniItem.objectLayerBackwall;
    if (!isBoundary && !isBackwall) continue;
    for (const tileIndex of item.tileIndexes) {
      const cell = toGrid(tileIndex);
      if (isBoundary) boundary[cell] = 1;
      if (isBackwall) backwall[cell] = 1;
    }
  }

  // --- Flood fills ---
  // cavityIndex: OUTSIDE / UNVISITED / cavity ordinal per cell.
  const cavityIndex = new Int32Array(gw * gh).fill(UNVISITED);
  const stack = new Int32Array(gw * gh);

  const fill = (start: number, marker: number, cells: number[] | null): void => {
    let top = 0;
    stack[top++] = start;
    cavityIndex[start] = marker;
    while (top > 0) {
      const cell = stack[--top];
      if (cells !== null) cells.push(cell);
      const x = cell % gw;
      // 4-connected neighbours, guarded at the grid edge.
      if (x > 0) tryVisit(cell - 1);
      if (x < gw - 1) tryVisit(cell + 1);
      if (cell - gw >= 0) tryVisit(cell - gw);
      if (cell + gw < gw * gh) tryVisit(cell + gw);
    }
    function tryVisit(next: number): void {
      if (cavityIndex[next] === UNVISITED && boundary[next] === 0) {
        cavityIndex[next] = marker;
        stack[top++] = next;
      }
    }
  };

  // 1. The border ring is item-free, so cell 0 reaches everything unbounded.
  fill(0, OUTSIDE, null);

  // 2. Remaining open cells form fully-enclosed cavities. Row-major scan order
  //    (ascending y, then x) means each cavity is discovered at its lowest
  //    tileIndex — deterministic ids.
  const cavityCellsGrid: number[][] = [];
  for (let cell = 0; cell < gw * gh; cell++) {
    if (cavityIndex[cell] !== UNVISITED || boundary[cell] !== 0) continue;
    const cells: number[] = [];
    fill(cell, cavityCellsGrid.length, cells);
    cavityCellsGrid.push(cells);
  }

  const fromGrid = (cell: number): number =>
    DrawHelpers.getTileIndex(
      new Vector2((cell % gw) - 1 + minX, Math.floor(cell / gw) - 1 + minY)
    );

  // --- Per-cavity features ---
  const features: CavityFeatures[] = cavityCellsGrid.map(cells => {
    let cavMinY = Infinity;
    let cavMaxY = -Infinity;
    let backwallCells = 0;
    for (const cell of cells) {
      const gy = Math.floor(cell / gw);
      if (gy < cavMinY) cavMinY = gy;
      if (gy > cavMaxY) cavMaxY = gy;
      if (backwall[cell] === 1) backwallCells++;
    }
    return {
      tagCounts: new Map<string, number>(),
      prefabCounts: new Map<string, number>(),
      nonLuxuryBedCount: 0,
      bboxHeight: cavMaxY - cavMinY + 1,
      backwallCells,
    };
  });

  // An item belongs to the cavity containing any of its cells (first hit wins,
  // deterministic via tileIndexes order); boundary/outside-only items belong to
  // none. Boundary items (tiles, doors) never contribute features.
  for (const item of items) {
    if (isRoomBoundary(item.oniItem)) continue;
    let assigned = -1;
    for (const tileIndex of item.tileIndexes) {
      const idx = cavityIndex[toGrid(tileIndex)];
      if (idx >= 0) {
        assigned = idx;
        break;
      }
    }
    if (assigned < 0) continue;
    const f = features[assigned];
    const roomTags = item.oniItem.roomTags;
    for (const tag of roomTags) f.tagCounts.set(tag, (f.tagCounts.get(tag) ?? 0) + 1);
    f.prefabCounts.set(item.id, (f.prefabCounts.get(item.id) ?? 0) + 1);
    if (roomTags.includes('BedType') && !roomTags.includes('LuxuryBedType'))
      f.nonLuxuryBedCount++;
  }

  // --- Rule evaluation ---
  const rooms: DetectedRoom[] = [];
  const cavities: Cavity[] = [];
  for (let id = 0; id < cavityCellsGrid.length; id++) {
    // Ascending tileIndex order (fill discovery order is DFS, not sorted).
    const cells = cavityCellsGrid[id].map(fromGrid).sort((a, b) => a - b);
    const size = cells.length;

    if (size > maxRoomSize) {
      cavities.push({ id, cells, size, result: 'too-large-for-room', matchedTypes: [] });
      continue;
    }

    const { matchedTypes, room } = evaluateCavity(size, features[id]);
    if (room !== null) {
      rooms.push({ ...room, cavityId: id, cells, size });
      cavities.push({ id, cells, size, result: 'room', matchedTypes });
    } else {
      cavities.push({
        id,
        cells,
        size,
        result: matchedTypes.length > 1 ? 'conflict' : 'miscellaneous',
        matchedTypes,
      });
    }
  }

  return { status: 'ok', rooms, cavities };
}

// Solid foundations bound rooms (all foundation tiles do, even gas-permeable
// ones — matching the game), plus the curated door list. NOT OniItem.isTile:
// that flag also covers kanim-tiled wires/pipes, which never bound rooms.
function isRoomBoundary(oniItem: OniItem): boolean {
  return oniItem.isFoundation || ROOM_BOUNDARY_DOORS.has(oniItem.id);
}

function constraintPasses(c: RoomConstraint, size: number, f: CavityFeatures): boolean {
  switch (c.kind) {
    case 'tag': {
      const count = f.tagCounts.get(c.tag) ?? 0;
      return count >= (c.min ?? 0) && count <= (c.max ?? Infinity);
    }
    case 'prefabGroup': {
      let count = 0;
      for (const prefab of c.prefabs) count += f.prefabCounts.get(prefab) ?? 0;
      return count >= (c.min ?? 0) && count <= (c.max ?? Infinity);
    }
    case 'noNonLuxuryBed':
      return f.nonLuxuryBedCount === 0;
    case 'minCeilingHeight':
      return f.bboxHeight >= c.height;
    case 'backwallComplete':
      return f.backwallCells === size;
  }
}

// Size gate → constraints → family collapse (highest tier, with the
// unverifiable-upgrade carve-out) → override collapse → verdict.
function evaluateCavity(
  size: number,
  f: CavityFeatures
): { matchedTypes: RoomTypeId[]; room: { type: RoomTypeId; possibleUpgrade?: RoomTypeId } | null } {
  const matched = ROOM_DEFINITIONS.filter(
    def =>
      size >= def.minSize &&
      size <= def.maxSize &&
      def.requires.every(c => constraintPasses(c, size, f))
  );

  // Family collapse: keep the highest matched tier per family. When the top tier
  // is upgradeUnverifiable and a lower tier also matched, keep the lower tier and
  // remember the upper as a possible upgrade.
  const byFamily = new Map<string, RoomTypeDefinition[]>();
  for (const def of matched) {
    const group = byFamily.get(def.family);
    if (group) group.push(def);
    else byFamily.set(def.family, [def]);
  }
  const candidates: { def: RoomTypeDefinition; possibleUpgrade?: RoomTypeId }[] = [];
  for (const group of byFamily.values()) {
    group.sort((a, b) => b.tier - a.tier);
    const top = group[0];
    if (top.upgradeUnverifiable && group.length > 1)
      candidates.push({ def: group[1], possibleUpgrade: top.id });
    else candidates.push({ def: top });
  }

  // Override collapse: drop candidates suppressed by another surviving candidate.
  const ids = new Set(candidates.map(c => c.def.id));
  const overridden = new Set<RoomTypeId>();
  for (const c of candidates)
    for (const o of c.def.overrides ?? []) if (ids.has(o)) overridden.add(o);
  const remaining = candidates.filter(c => !overridden.has(c.def.id));

  // Deterministic ordering: rule-table order.
  remaining.sort(
    (a, b) => ROOM_DEFINITIONS.indexOf(a.def) - ROOM_DEFINITIONS.indexOf(b.def)
  );
  const matchedTypes = remaining.map(c => c.def.id);

  if (remaining.length !== 1) return { matchedTypes, room: null };
  const winner = remaining[0];
  return {
    matchedTypes,
    room: winner.possibleUpgrade
      ? { type: winner.def.id, possibleUpgrade: winner.possibleUpgrade }
      : { type: winner.def.id },
  };
}

// Sorted, de-duplicated room tag list for a blueprint — what the backend stores
// in `blueprint.rooms`. Includes possibleUpgrade tags so a "Park / Nature
// Reserve" cavity is findable under both filters.
export function roomSearchTags(result: RoomDetectionResult): RoomTypeId[] {
  const tags = new Set<RoomTypeId>();
  for (const room of result.rooms) {
    tags.add(room.type);
    if (room.possibleUpgrade) tags.add(room.possibleUpgrade);
  }
  return Array.from(tags).sort();
}
