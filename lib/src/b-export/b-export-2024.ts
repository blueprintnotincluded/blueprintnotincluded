// Type definitions for the OniExtract2024 game export (game version U59-737790-SCA,
// Spaced Out DLC). The 2024 mod replaces the single legacy `database.json` with 13
// separate JSON files. These interfaces model the *raw* shapes as exported by the game,
// for the build-time converter (`app/api/batch/convert-export-2024.ts`) to read.
//
// Scope: the existing website feature set (buildings / elements / build menu / icons).
// `entities`, `items`, `recipe`, `food`, `geyser`, `db`, etc. are new capabilities and
// are intentionally not modeled here yet (see app/api/batch/convert-export-2024.md
// "Unused export files").
//
// The legacy `b-export.ts` types remain the *internal* shape consumed by the loaders;
// the converter maps from these raw types into that internal shape.

// Every 2024 export file carries this root metadata.
export interface BExport2024Meta {
  buildVersion: number;
  dlcs: string[];
  ExportFileName: string;
  DatabaseDirName: string;
}

// A Klei tag/hashed-string pair as serialized in the 2024 export.
export interface BTag2024 {
  Name: string;
  IsValid: boolean;
}

// ---------------------------------------------------------------------------
// building.json
// ---------------------------------------------------------------------------

export interface BKPrefabID2024 {
  name: string;
  nameString: string;
  SaveLoadTag: BTag2024;
  PrefabTag: BTag2024;
  defaultLayer: number;
  // Per EXPORT_SCHEMA.md this is sometimes a space-separated string, sometimes an array.
  tags: BTag2024[] | string | null;
  // Schema shows this as a single string in some entries, array in others.
  requiredDlcIds: string[] | string | null;
  forbiddenDlcIds: string[] | string | null;
}

export interface BBuildingDef2024 {
  // `name` is the plain prefab id — safe lookup key (e.g. "FabricatedWood").
  name: string;
  // `nameString` is the rich-text display name (e.g. `<link="WOOD">Wood</link>`).
  nameString: string;
  // Absent only on offlineMerged entries (no in-game registration to read it from).
  kPrefabID?: BKPrefabID2024;
  tags: BTag2024[] | null;

  widthInCells: number;
  heightInCells: number;
  materialCategory: string[] | null;
  materialMass: number[] | null;

  // Legacy `isTile` was split into two booleans in 2024.
  isFoundation: boolean;
  isKAnimTile: boolean;
  isUtility: boolean;
  dragBuild: boolean;

  buildLocationRule: number;
  permittedRotations: number;
  sceneLayer: number;
  objectLayer: number;
  // Game-native overlay name (e.g. "Power", "GasConduit"), or null when the building has no
  // special overlay. U59 switched this from the old Klei HashedString hex to the name string.
  viewMode: string | null;
  defaultAnimState: string;
  // Almost always null in this export; icon comes from the prefab key instead.
  uiSpriteName: string | null;

  // OPTIONAL placement of ui_image/<name>.png relative to the building footprint, in CELL
  // units. The footprint occupies (0,0)–(widthInCells,heightInCells); origin bottom-left,
  // +x right, +y up. The PNG maps onto the rectangle [x, x+w] × [y, y+h]; x/y may be negative
  // and x+w / y+h may exceed the footprint where the art overhangs (e.g. SteamTurbine2's
  // exhaust hangs below → negative y). Absent ⇒ the website assumes image == footprint
  // (legacy stretch-to-footprint). See app/api/batch/convert-export-2024.md "uiImageRect".
  uiImageRect?: { x: number; y: number; w: number; h: number };

  // Per-port utility connections (power/gas/liquid/automation/solid conduits). Added to the
  // export in U59-737790-SCA (2026-06). `offset` uses the game's CellOffset convention, which
  // matches the website's internal pre-rotation, y-up, footprint-relative coordinates exactly
  // (verified field-by-field against the pre-2024 DB — no transform needed). `type` is the
  // ConnectionType enum *member name* (e.g. "GasInput", "LogicReset"); the converter maps it
  // to the ConnectionType int via CONNECTION_TYPE_BY_NAME. Absent on buildings with no ports.
  utilities?: BUtilityConnection2024[];

  // Nominal, unobstructed reach previews. Omitted when the building has none.
  areasOfEffect?: import('../area-of-effect').AreaOfEffect[];

  // Domain payloads (kept opaque — not needed for rendering/build-menu).
  energyGenerator?: unknown;
  conduitConsumer?: unknown;
  conduitDispenser?: unknown;
  plantablePlot?: unknown;
  elementConverters?: unknown[];
  elementConsumers?: unknown[];
  passiveElementConsumers?: unknown[];
  storage?: unknown;
  battery?: unknown;

  // Steam workshop id of the mod that registered this building; absent ⇒ vanilla
  // (never emitted as null). Stable key for grouping/filtering/tagging.
  mod?: string;
  // Display title from the mod's own metadata; may change across mod updates.
  modTitle?: string;
  // Reduced-schema entries appended by the offline DLL pipeline (none in the
  // current export — tolerated, not featured; see spec/WEBSITE_MOD_IMPORT.md §3).
  offlineMerged?: true;
}

// One per-building utility port from `bBuildingDefList[].utilities`.
export interface BUtilityConnection2024 {
  offset: { x: number; y: number };
  // ConnectionType enum member name, e.g. "PowerInput", "GasOutput", "LogicReset",
  // "LogicRibbonInput". Mapped to the ConnectionType int by the converter.
  type: string;
  // Second port of the same conduit type on this building (filter bypass / overflow outlet).
  isSecondary: boolean;
}

// One entry of `buildingAndSubcategoryDataPairs[<categoryName>]`.
export interface BBuildingSubcategoryPair2024 {
  Key: string; // prefab id
  Value: string; // subcategory name
}

export interface BBuildMenuCategory2024 {
  category: number;
  categoryName: string;
  categoryIcon: string;
}

export interface BBuildingFile2024 extends BExport2024Meta {
  bBuildingDefList: BBuildingDef2024[];
  buildMenuCategories: BBuildMenuCategory2024[];
  // Keyed by lowercase category name (e.g. "base", "oxygen").
  buildingAndSubcategoryDataPairs: { [categoryName: string]: BBuildingSubcategoryPair2024[] };
  // The game's room-system tag vocabulary (33 tags in U59). Each building def's
  // `tags` intersected with this set yields its roomTags (see BBuilding.roomTags).
  roomConstraintTags?: BTag2024[] | null;
  requiredSkillPerkMap?: unknown;
  // Root roster of mods the game exported natively this run. Metadata only —
  // NOT the source of truth (that's the distinct `mod` values across
  // bBuildingDefList; see the handoff §2 warning).
  mods?: { id: string; title: string; buildings: string[] }[];
  // Present only when the offline fallback merge ran (never in current exports).
  modMergeInfo?: unknown;
}

// ---------------------------------------------------------------------------
// elements.json
// ---------------------------------------------------------------------------

export interface BElement2024 {
  name: string; // rich-text display name
  id: string; // plain id (e.g. "WoodLog")
  tag: number; // SimHash as a signed int
  oreTags: string[] | null;
  // Element.State. The export is inconsistent here: usually the enum's numeric
  // value as a string ('5', '6', '20'), but the *name* ('Solid') for most
  // solids. The low 2 bits are the phase, the rest are flags - see
  // parseElementState() in convert-export-2024.ts.
  state: string;
  buildMenuSort: number;
  materialCategory: string;
  color: number;
  conduitColor: number;
  uiColor: number;

  // Sim cell capacity and the load-time defaults the game's own UI seeds its
  // mass/temperature pickers with. Masses are kg, temperatures Kelvin (same
  // scale as lowTemp/highTemp). Gases get maxMass 1.8 / defaultMass 1.0
  // applied at runtime, since gas.yaml ships without them.
  maxMass: number;
  defaultMass: number;
  defaultTemperature: number;
  lowTemp: number;
  highTemp: number;
}

export interface BElementsFile2024 extends BExport2024Meta {
  // Keyed by SimHash as a decimal integer *string* (e.g. "16214647").
  elementTable: { [decimalSimHash: string]: BElement2024 };
}

// ---------------------------------------------------------------------------
// uiSpriteInfo.json
// ---------------------------------------------------------------------------

export interface BColor2024 {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface BUiSpriteInfo2024 {
  id: string; // rich-text
  name: string; // plain display name
  spriteName: string;
  textureName: string;
  color: BColor2024;
}

export interface BUiSpriteInfoFile2024 extends BExport2024Meta {
  // Keyed by prefab tag name (e.g. "FabricatedWood"). The key matches the
  // `ui_image/<key>.png` flat-icon filename (verified 1241/1241).
  uiSpriteInfos: { [prefabTag: string]: BUiSpriteInfo2024 };
}

// ---------------------------------------------------------------------------
// po_string.json
// ---------------------------------------------------------------------------

// One top-level category (ELEMENTS, BUILDINGS, UI, ...). Keys are the full dotted
// string id (e.g. "ELEMENTS.MOLTENZINC.NAME"); values are the English source text,
// still carrying Klei rich-text markup (<link=...>, <style=...>, etc.).
export type BPoStringSection2024 = { [stringId: string]: string };

export interface BPoStringFile2024 extends BExport2024Meta {
  // The localizable game strings, grouped by category. The metadata fields from
  // BExport2024Meta sit alongside the category dicts at the same level, hence the
  // union value type — iterate object-valued entries to get the sections.
  [category: string]: BPoStringSection2024 | string | string[] | number;
}
