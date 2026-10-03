import { Vector2 } from '../vector2';
import { DrawHelpers } from '../drawing/draw-helpers';
import { ROCKET_ATTACH_TAG } from '../b-export/b-building';
import { BlueprintItem } from './blueprint-item';

// Rocket stacking geometry.
//
// A rocket in a .blueprint is nothing but ordinary `buildings[]` entries: there is no
// rocket key, no hardpoint data, no "this is a stack" marker. The Blueprints mod
// recomputes the stacking from the game's BuildingDefs at placement time, and so do
// we, from the same facts as exported:
//
//   - a module (or the LaunchPad) OFFERS a hardpoint: `attachPoints`, tag "Rocket",
//     an offset from its origin cell -- (0, heightInCells) on every vanilla module,
//     (0, 2) on the 7x2 pad. The three TopOnly modules offer none.
//   - a module SITS ON a hardpoint: `attachableTo: "Rocket"`, at `attachablePosition`
//     from its origin cell -- (0, 0) on every vanilla module.
//
// So module B is stacked on A exactly when B's attach cell is A's hardpoint cell.
// Everything here works in world cells and honours the item's orientation, although
// every vanilla offset has x = 0 and so reads the same flipped or not.

function orientedOffset(item: BlueprintItem, offset: { x: number; y: number }): Vector2 {
  const rotated = DrawHelpers.rotateVector2(
    new Vector2(offset.x, offset.y),
    Vector2.Zero,
    item.rotation
  );
  const scaled = DrawHelpers.scaleVector2(rotated, Vector2.Zero, item.scale);
  // Cells are integers; a quarter-turn through sin/cos leaves float dust behind.
  return new Vector2(Math.round(scaled.x), Math.round(scaled.y));
}

// The world cell of the rocket hardpoint this item offers, or null when nothing can
// be stacked on it (a nosecone, or a building that is no part of a rocket).
export function rocketHardpointCell(item: BlueprintItem): Vector2 | null {
  const point = item.oniItem.rocketAttachPoint;
  if (point == null) return null;
  const offset = orientedOffset(item, point.offset);
  return new Vector2(item.position.x + offset.x, item.position.y + offset.y);
}

// Whether this item has to sit on a rocket hardpoint.
export function attachesToRocket(item: BlueprintItem): boolean {
  return item.oniItem.isRocketModule && item.oniItem.attachableTo == ROCKET_ATTACH_TAG;
}

// The world cell of this item that has to land on a hardpoint.
export function rocketAttachCell(item: BlueprintItem): Vector2 {
  const offset = orientedOffset(item, item.oniItem.attachablePosition);
  return new Vector2(item.position.x + offset.x, item.position.y + offset.y);
}

// Where `item` would have to be positioned for its attach cell to land on `cell`.
export function positionForAttachCell(item: BlueprintItem, cell: Vector2): Vector2 {
  const offset = orientedOffset(item, item.oniItem.attachablePosition);
  return new Vector2(cell.x - offset.x, cell.y - offset.y);
}

// How far outside the footprint a module would occupy the cursor may be and still
// snap onto a hardpoint. One cell: enough that aiming at the seam between two
// modules lands, small enough that a module can still be set down beside a stack.
const SNAP_MARGIN = 1;

// Where a rocket module being placed should go so that it sits on a hardpoint near
// the cursor, or null to leave it under the cursor.
//
// The mod itself does not snap; it only refuses a module that is not on a
// hardpoint. In game that refusal is visible as you move the cursor. The editor has
// no such feedback, so it does the friendlier equivalent and pulls the module onto
// the stack: a module that is one cell off looks placed and is not buildable.
//
// A hardpoint is a candidate when it is free (no module already sits on it) and the
// cursor is inside the footprint the module would occupy there, give or take
// SNAP_MARGIN. Among candidates the nearest origin wins. Away from every hardpoint
// this returns null and the module goes where the cursor is -- a stack with no pad
// in the blueprint is legitimate (it is pasted onto a pad that already exists).
export function snapRocketModulePosition(
  item: BlueprintItem,
  cursor: Vector2,
  placedItems: BlueprintItem[]
): Vector2 | null {
  if (!attachesToRocket(item)) return null;

  const taken = new Set<string>();
  for (const other of placedItems)
    if (other !== item && attachesToRocket(other)) {
      const cell = rocketAttachCell(other);
      taken.add(cell.x + ',' + cell.y);
    }

  const halfWidth = Math.floor(item.oniItem.size.x / 2);
  const height = item.oniItem.size.y;

  let best: Vector2 | null = null;
  let bestDistance = Infinity;
  for (const other of placedItems) {
    if (other === item) continue;
    const hardpoint = rocketHardpointCell(other);
    if (hardpoint == null || taken.has(hardpoint.x + ',' + hardpoint.y)) continue;

    const origin = positionForAttachCell(item, hardpoint);
    const dx = cursor.x - origin.x;
    const dy = cursor.y - origin.y;
    if (Math.abs(dx) > halfWidth + SNAP_MARGIN) continue;
    if (dy < -SNAP_MARGIN || dy > height - 1 + SNAP_MARGIN) continue;

    const distance = Math.abs(dx) + Math.abs(dy);
    if (distance < bestDistance) {
      best = origin;
      bestDistance = distance;
    }
  }
  return best;
}
