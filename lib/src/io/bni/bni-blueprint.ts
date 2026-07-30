import { BniBuilding } from './bni-building';

// BlueprintsV2 world-note annotation pins (spec/blueprintsv2-import-spec.md §2.4).
// type 0 = text note, type 1 = element note (id is the element tag hash,
// mass in kg, temp in Kelvin).
export interface BniWorldNote {
  x: number;
  y: number;
  type: number;
  title?: string;
  text?: string;
  tinthex?: string;
  // Text notes only. The mod's `BlueprintNoteData.Symbol` — the *name* of a
  // sprite in its `textnote_icons` asset folder (`note_info`, `note_warn`,
  // `note_question`, `note_num_0`…`note_num_9`), keyed exactly as the file is.
  // Empty, absent or unrecognised means the default note sprite, which is what
  // the mod itself falls back to (BlueprintNoteData.GetNoteSprite).
  symbol?: string;
  id?: number;
  mass?: number;
  temp?: number;
}

// Planning Tool mod overlay cell (§2.5) — decorative only.
export interface BniPlanShape {
  x: number;
  y: number;
  shape: number;
  color: number;
}

export class BniBlueprint {
  friendlyname: string = '';
  buildings: BniBuilding[] = [];
  digcommands: any[] = [];

  // BlueprintsV2 v3 metadata (all optional — the mod omits empty keys).
  // Parsed for display/prefill; the byte-exact source of truth for round-trip
  // is the raw upload stored server-side, never this parsed view.
  blueprintVersion?: number;
  userdesc?: string;
  icon?: string;
  icontint?: string;
  worldNotes?: BniWorldNote[];
  planningtoolmod_shapecollection?: BniPlanShape[];

  // BlueprintsV2 v6.2.0+ free-form annotation block. Deserializes mod-side into
  // a `Dictionary<string, string>`: FLAT, and string-valued only — any other
  // JSON token type is silently dropped on the next in-game save. The mod never
  // reads or validates the contents, and preserves them through disk I/O,
  // in-game clone and the multiplayer packets.
  //
  // Shared with the mod and with any other tool, so it is treated as someone
  // else's object: read whole, mutate only our own namespaced keys, write whole
  // back. Our terrain annotations live in here — see blueprint/terrain-metadata.ts.
  metadata?: Record<string, string>;
}
