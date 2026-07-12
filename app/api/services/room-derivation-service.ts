import {
  Blueprint as SharedBlueprint,
  detectRooms,
  MdbBlueprint,
  roomSearchTags,
  RoomTypeId,
} from '../../../lib/index';

// Server-side room derivation: parse stored blueprint data and run the shared
// detector. The client never supplies `rooms` — this is the only writer.
// Requires the game database to be loaded (OniItem.load in app.ts startup).
//
// Returns the sorted deduped room tag list, or null when detection was not
// possible (blueprint too large, unparseable data). Never throws: a derivation
// failure must never fail a save.
export function deriveRooms(data: unknown): RoomTypeId[] | null {
  try {
    const parsed = new SharedBlueprint();
    parsed.importFromMdb(data as MdbBlueprint);
    const result = detectRooms(parsed);
    // 'empty' is a successful derivation (no buildings -> no rooms); only
    // 'too-large' means "could not compute".
    return result.status === 'too-large' ? null : roomSearchTags(result);
  } catch (error) {
    console.log('room derivation error');
    console.log(error);
    return null;
  }
}
