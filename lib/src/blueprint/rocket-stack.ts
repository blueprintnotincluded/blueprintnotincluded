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
