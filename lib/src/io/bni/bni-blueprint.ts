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
}
