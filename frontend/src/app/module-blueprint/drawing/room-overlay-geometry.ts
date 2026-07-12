import {
  Cavity,
  DrawHelpers,
  ROOM_DEFINITIONS,
  RoomDetectionResult,
  RoomFamily,
  RoomTypeId,
} from "../../../../../lib/index";
import { ROOM_TYPE_LABELS } from "../utils/room-labels";

export { ROOM_TYPE_LABELS };

// Pure geometry/style derivation for the Room overlay — everything the PIXI
// layer (draw-room-overlay.ts) needs, precomputed once per detection result so
// the per-frame work is only camera transforms. No PIXI here: this module is
// unit-tested directly (renderer stays mocked per repo test rules).

// One horizontal run of cavity cells (tile coords, y-up world).
export interface CavitySpan {
  x: number;
  y: number;
  length: number;
}

export interface CavityOverlayGeometry {
  cavityId: number;
  color: number;
  alpha: number;
  label: string | null;
  // Center cell coordinates of the cavity bounding box (may be fractional).
  // Screen position: ((center.x + offset.x + 0.5) * zoom, (offset.y - center.y + 0.5) * zoom).
  center: { x: number; y: number };
  spans: CavitySpan[];
}

export const TOO_LARGE_NOTICE = $localize`:room overlay notice:Blueprint too large for room detection`;

// One color per room family (visually matching the game's F11 palette spirit).
const FAMILY_COLORS: Record<RoomFamily, number> = {
  washroom: 0x26c6da,
  sleep: 0x5c7cfa,
  dining: 0xffa94d,
  "medical:massage": 0xf783ac,
  "medical:hospital": 0xff6b6b,
  recreation: 0xda77f2,
  park: 0x69db7c,
  kitchen: 0xffd43b,
  power: 0xff922b,
  "agriculture:greenhouse": 0x94d82d,
  "agriculture:stable": 0xa9805b,
  science: 0x9775fa,
};

const MISC_COLOR = 0xadb5bd;
const CONFLICT_COLOR = 0xfa5252;
const TOO_LARGE_COLOR = 0x868e96;

const ROOM_ALPHA = 0.32;
const MISC_ALPHA = 0.16;
const CONFLICT_ALPHA = 0.3;
const TOO_LARGE_ALPHA = 0.1;

const familyById = new Map<RoomTypeId, RoomFamily>(
  ROOM_DEFINITIONS.map((def) => [def.id, def.family]),
);

export function buildRoomOverlayGeometry(
  result: RoomDetectionResult,
): CavityOverlayGeometry[] {
  const roomByCavity = new Map(
    result.rooms.map((room) => [room.cavityId, room]),
  );

  return result.cavities.map((cavity) => {
    let color: number;
    let alpha: number;
    let label: string | null = null;

    const room = roomByCavity.get(cavity.id);
    if (cavity.result == "room" && room != null) {
      color = FAMILY_COLORS[familyById.get(room.type)!];
      alpha = ROOM_ALPHA;
      label = room.possibleUpgrade
        ? `${ROOM_TYPE_LABELS[room.type]} / ${
            ROOM_TYPE_LABELS[room.possibleUpgrade]
          }`
        : ROOM_TYPE_LABELS[room.type];
    } else if (cavity.result == "conflict") {
      color = CONFLICT_COLOR;
      alpha = CONFLICT_ALPHA;
      label = cavity.matchedTypes.map((t) => ROOM_TYPE_LABELS[t]).join(" / ");
    } else if (cavity.result == "too-large-for-room") {
      color = TOO_LARGE_COLOR;
      alpha = TOO_LARGE_ALPHA;
    } else {
      color = MISC_COLOR;
      alpha = MISC_ALPHA;
    }

    return {
      cavityId: cavity.id,
      color,
      alpha,
      label,
      center: cavityCenter(cavity),
      spans: cellsToSpans(cavity.cells),
    };
  });
}

// Cavity cells arrive sorted by ascending tileIndex (row-major: y, then x), so
// horizontal runs are consecutive entries — merge them into spans to keep the
// per-frame rect count low even for large miscellaneous cavities.
function cellsToSpans(cells: number[]): CavitySpan[] {
  const spans: CavitySpan[] = [];
  let current: CavitySpan | null = null;
  let previous = { x: 0, y: 0 };

  for (const cell of cells) {
    const p = DrawHelpers.getTilePosition(cell);
    if (current != null && p.y == previous.y && p.x == previous.x + 1)
      current.length++;
    else {
      current = { x: p.x, y: p.y, length: 1 };
      spans.push(current);
    }
    previous = p;
  }

  return spans;
}

function cavityCenter(cavity: Cavity): { x: number; y: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cavity.cells) {
    const p = DrawHelpers.getTilePosition(cell);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
