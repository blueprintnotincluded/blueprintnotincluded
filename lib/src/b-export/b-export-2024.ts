// Type definitions for the OniExtract2024 game export (game version U59-737790-SCA,
// Spaced Out DLC). The 2024 mod replaces the single legacy `database.json` with 13
// separate JSON files. These interfaces model the *raw* shapes as exported by the game,
// for the build-time converter (`app/api/batch/convert-export-2024.ts`) to read.
//
// Scope: the existing website feature set (buildings / elements / build menu / icons).
// `entities`, `items`, `recipe`, `food`, `geyser`, `db`, etc. are new capabilities and
// are intentionally not modeled here yet (see EXPORT_2024_MIGRATION_PLAN.md "Resolve
// before coding").
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
  kPrefabID: BKPrefabID2024;
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
  // Klei HashedString hex (e.g. "0x1EDC6185" == "Power"); "0x0" == no overlay.
  viewMode: string;
  defaultAnimState: string;
  // Almost always null in this export; icon comes from the prefab key instead.
  uiSpriteName: string | null;

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
  roomConstraintTags?: unknown;
  requiredSkillPerkMap?: unknown;
}

// ---------------------------------------------------------------------------
// elements.json
// ---------------------------------------------------------------------------

export interface BElement2024 {
  name: string; // rich-text display name
  id: string; // plain id (e.g. "WoodLog")
  tag: number; // SimHash as a signed int
  oreTags: string[] | null;
  state: string;
  buildMenuSort: number;
  materialCategory: string;
  color: number;
  conduitColor: number;
  uiColor: number;
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
