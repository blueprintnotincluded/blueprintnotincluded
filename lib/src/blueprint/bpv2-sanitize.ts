import { Vector2 } from '../vector2';
import { BniBlueprint } from '../io/bni/bni-blueprint';

// A mirror of the BlueprintsV2 mod's `SanitizePositions()`, which runs on every
// blueprint load.
//
// The mod finds the minimum x and y across buildings, dig commands, world notes
// and planning-tool shapes; if either minimum is negative it shifts all four
// collections by (-minX, -minY), so the blueprint is re-origined to (0,0).
//
// It does NOT touch anything inside `metadata`. That is the whole problem this
// module exists to solve: a blueprint we author with negative coordinates gets
// re-origined by the game, our terrain annotations do not, and every marker
// ends up offset from the buildings it was annotating.
//
// The fix is symmetric, and both halves must agree on the same minimum:
//   - On export we apply this shift ourselves, to the mod-visible collections
//     AND to our terrain annotations, so the mod's own sanitize is a guaranteed
//     no-op on the file we wrote.
//   - On import we recompute the same minimum and, when it is nonzero, apply
//     the identical shift to our terrain annotations — realigning us with a
//     file produced by an older website build or edited by hand.
//
// Terrain annotations are deliberately excluded from the minimum itself. Only
// the collections the mod can see may influence the offset, because the import
// side has to infer an offset the mod may already have applied, and the mod
// cannot see terrain. Including terrain here would make export and import stop
// being inverses. (Camera framing is a separate concern — Blueprint.getBoundingBox
// does include terrain, so a geyser-only blueprint still frames sensibly.)

// The mod-visible positions of a BlueprintsV2 blueprint, in the order the mod
// itself scans them.
function modVisiblePositions(bni: BniBlueprint): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];

  for (const building of bni.buildings ?? [])
    if (building.offset != null) positions.push(building.offset);
  for (const dig of bni.digcommands ?? [])
    if (dig != null && typeof dig.x === 'number' && typeof dig.y === 'number') positions.push(dig);
  for (const note of bni.worldNotes ?? []) positions.push(note);
  for (const shape of bni.planningtoolmod_shapecollection ?? []) positions.push(shape);

  return positions;
}

// The offset the mod's SanitizePositions() would apply to this blueprint, or
// null when it would leave the blueprint alone.
//
// Returns null for an already-normalized blueprint (the common case: anything
// saved by the mod is normalized already) and for one with no mod-visible
// content at all, matching the mod's behaviour on an empty minimum.
export function modSanitizeOffset(bni: BniBlueprint): Vector2 | null {
  const positions = modVisiblePositions(bni);
  if (positions.length === 0) return null;

  let minX = positions[0].x;
  let minY = positions[0].y;
  for (const position of positions) {
    if (position.x < minX) minX = position.x;
    if (position.y < minY) minY = position.y;
  }

  // The mod only re-origins when something is actually negative; a blueprint
  // sitting at a positive offset is left where it is. Mirror that exactly,
  // or our import-side correction would invent a shift the mod never applied.
  if (minX >= 0 && minY >= 0) return null;

  return new Vector2(-minX, -minY);
}

// Shift a blueprint's mod-visible collections in place by `offset`, exactly as
// SanitizePositions() would. Used on export so that the file we write is
// already normalized and the mod's own pass changes nothing.
//
// Terrain annotations are shifted by the caller with the same offset — they
// live in `metadata`, which this function does not own.
export function applySanitizeOffset(bni: BniBlueprint, offset: Vector2): void {
  for (const building of bni.buildings ?? [])
    if (building.offset != null) {
      building.offset.x += offset.x;
      building.offset.y += offset.y;
    }
  for (const dig of bni.digcommands ?? [])
    if (dig != null && typeof dig.x === 'number' && typeof dig.y === 'number') {
      dig.x += offset.x;
      dig.y += offset.y;
    }
  for (const note of bni.worldNotes ?? []) {
    note.x += offset.x;
    note.y += offset.y;
  }
  for (const shape of bni.planningtoolmod_shapecollection ?? []) {
    shape.x += offset.x;
    shape.y += offset.y;
  }
}
