// ONI room-type rules, declared as data. This table IS the documentation of what
// the detector recognises — spec: spec/rooms.md, game rules: U57 room reference.
//
// Counts come from the buildings inside a fully-enclosed cavity:
// - tag constraints count buildings carrying a room-system tag (OniItem.roomTags,
//   sourced from the game export's own roomConstraintTags vocabulary).
// - prefabGroup constraints count specific prefab ids, for the few rules the game
//   expresses at the building level rather than the tag level.
// Sizes are interior cells; boundary cells (tiles and doors) never count.

export const ROOM_TYPE_IDS = [
  'latrine',
  'washroom',
  'barracks',
  'luxuryBarracks',
  'privateBedroom',
  'messHall',
  'greatHall',
  'banquetHall',
  'massageClinic',
  'hospital',
  'recreationRoom',
  'park',
  'natureReserve',
  'kitchen',
  'powerPlant',
  'greenhouse',
  'laboratory',
  'stable',
] as const;
export type RoomTypeId = (typeof ROOM_TYPE_IDS)[number];

// Families group upgrade paths: within a family the highest matching tier wins
// (a Washroom always also satisfies Latrine — that's an upgrade, not a conflict).
export type RoomFamily =
  | 'washroom'
  | 'sleep'
  | 'dining'
  | 'medical:massage'
  | 'medical:hospital'
  | 'recreation'
  | 'park'
  | 'kitchen'
  | 'power'
  | 'agriculture:greenhouse'
  | 'agriculture:stable'
  | 'science';

export type RoomConstraint =
  // Count of member buildings carrying a room-system tag, within [min, max].
  | { kind: 'tag'; tag: string; min?: number; max?: number }
  // Count of member buildings whose prefab id is in the group, within [min, max].
  | { kind: 'prefabGroup'; prefabs: readonly string[]; min?: number; max?: number }
  // No building with BedType but not LuxuryBedType (Bed, LadderBed, MedicalCot).
  | { kind: 'noNonLuxuryBed' }
  // Cavity bounding-box height (see spec/rooms.md §11 #1 for the game-fidelity caveat).
  | { kind: 'minCeilingHeight'; height: number }
  // Every cavity cell covered by a backwall building (objectLayer 2: Drywall,
  // Tempshift Plate, ...).
  | { kind: 'backwallComplete' };

export interface RoomTypeDefinition {
  id: RoomTypeId;
  family: RoomFamily;
  tier: number; // within family; higher tier wins
  minSize: number;
  maxSize: number;
  requires: RoomConstraint[]; // all must pass
  // Cross-family precedence: a match of this type suppresses matches of these types
  // (requirement supersets the game does NOT treat as conflicts).
  overrides?: RoomTypeId[];
  // The game gates this tier on data blueprints cannot represent (wild plants for
  // Nature Reserve). When this tier and the tier below both match, the detector
  // reports the lower tier with `possibleUpgrade` set to this id instead of
  // collapsing to this tier.
  upgradeUnverifiable?: boolean;
  // Documented deviations from exact game behavior, for the overlay UI.
  caveats?: string;
}

// Sugar for the recurring "no industrial machinery" clause. Composts carry no
// room tag, so they stay allowed in a Latrine — matches the game.
const NO_INDUSTRIAL: RoomConstraint = { kind: 'tag', tag: 'IndustrialMachinery', max: 0 };

// The game requires "an Ornament displayed on" a pedestal/shelf. Blueprints store
// buildings, not displayed contents, so the display furniture itself counts.
export const ORNAMENT_PROXY_PREFABS = ['ItemPedestal', 'GravitasPedestal', 'Shelf'] as const;
const ORNAMENT: RoomConstraint = { kind: 'prefabGroup', prefabs: ORNAMENT_PROXY_PREFABS, min: 1 };

export const ROOM_DEFINITIONS: readonly RoomTypeDefinition[] = [
  {
    id: 'latrine',
    family: 'washroom',
    tier: 1,
    minSize: 12,
    maxSize: 64,
    requires: [
      { kind: 'tag', tag: 'ToiletType', min: 1 },
      { kind: 'tag', tag: 'WashStation', min: 1 },
      NO_INDUSTRIAL,
    ],
  },
  {
    id: 'washroom',
    family: 'washroom',
    tier: 2,
    minSize: 12,
    maxSize: 64,
    requires: [
      { kind: 'tag', tag: 'FlushToiletType', min: 1 },
      { kind: 'tag', tag: 'AdvancedWashStation', min: 1 },
      { kind: 'prefabGroup', prefabs: ['Outhouse'], max: 0 },
      NO_INDUSTRIAL,
    ],
  },
  {
    id: 'barracks',
    family: 'sleep',
    tier: 1,
    minSize: 12,
    maxSize: 64,
    requires: [{ kind: 'tag', tag: 'BedType', min: 1 }, NO_INDUSTRIAL],
  },
  {
    id: 'luxuryBarracks',
    family: 'sleep',
    tier: 2,
    minSize: 12,
    maxSize: 64,
    requires: [
      { kind: 'tag', tag: 'LuxuryBedType', min: 1 },
      { kind: 'noNonLuxuryBed' },
      { kind: 'tag', tag: 'Decoration', min: 1 },
      { kind: 'minCeilingHeight', height: 4 },
      NO_INDUSTRIAL,
    ],
  },
  {
    id: 'privateBedroom',
    family: 'sleep',
    tier: 3,
    minSize: 24,
    maxSize: 64,
    requires: [
      { kind: 'tag', tag: 'LuxuryBedType', min: 1, max: 1 },
      { kind: 'noNonLuxuryBed' },
      { kind: 'tag', tag: 'Decoration', min: 2 },
      { kind: 'minCeilingHeight', height: 4 },
      { kind: 'backwallComplete' },
      NO_INDUSTRIAL,
    ],
  },
  {
    id: 'messHall',
    family: 'dining',
    tier: 1,
    minSize: 12,
    maxSize: 64,
    requires: [{ kind: 'tag', tag: 'DiningTableType', min: 1 }, NO_INDUSTRIAL],
  },
  {
    id: 'greatHall',
    family: 'dining',
    tier: 2,
    minSize: 32,
    maxSize: 120,
    requires: [
      { kind: 'tag', tag: 'DiningTableType', min: 1 },
      { kind: 'tag', tag: 'RecBuilding', min: 1 },
      ORNAMENT,
      NO_INDUSTRIAL,
    ],
    overrides: ['recreationRoom'],
    caveats: 'ornament requirement satisfied by display furniture (pedestal/shelf)',
  },
  {
    id: 'banquetHall',
    family: 'dining',
    tier: 3,
    minSize: 32,
    maxSize: 120,
    requires: [
      { kind: 'prefabGroup', prefabs: ['MultiMinionDiningTable'], min: 1 },
      ORNAMENT,
      NO_INDUSTRIAL,
    ],
    overrides: ['recreationRoom'],
    caveats: 'ornament requirement satisfied by display furniture (pedestal/shelf)',
  },
  {
    id: 'massageClinic',
    family: 'medical:massage',
    tier: 1,
    minSize: 12,
    maxSize: 64,
    requires: [
      { kind: 'tag', tag: 'DeStressingBuilding', min: 1 },
      { kind: 'tag', tag: 'Decoration', min: 1 },
      NO_INDUSTRIAL,
    ],
  },
  {
    id: 'hospital',
    family: 'medical:hospital',
    tier: 1,
    minSize: 12,
    maxSize: 96,
    requires: [
      { kind: 'tag', tag: 'Clinic', min: 1 },
      { kind: 'tag', tag: 'ToiletType', min: 1 },
      { kind: 'tag', tag: 'DiningTableType', min: 1 },
      NO_INDUSTRIAL,
    ],
    // A Hospital necessarily contains a mess table, a toilet, and (via Medical
    // Cot's BedType) a bed — the game doesn't call those conflicts.
    overrides: ['messHall', 'latrine', 'washroom', 'barracks'],
  },
  {
    id: 'recreationRoom',
    family: 'recreation',
    tier: 1,
    minSize: 12,
    maxSize: 96,
    requires: [
      { kind: 'tag', tag: 'RecBuilding', min: 1 },
      { kind: 'tag', tag: 'Decoration', min: 1 },
      NO_INDUSTRIAL,
    ],
  },
  {
    id: 'park',
    family: 'park',
    tier: 1,
    minSize: 12,
    maxSize: 64,
    requires: [{ kind: 'tag', tag: 'Park', min: 1 }, NO_INDUSTRIAL],
    caveats: 'wild-plant requirement not representable in blueprints; treated as satisfied',
  },
  {
    id: 'natureReserve',
    family: 'park',
    tier: 2,
    minSize: 32,
    maxSize: 120,
    requires: [{ kind: 'tag', tag: 'Park', min: 1 }, NO_INDUSTRIAL],
    // Park vs Nature Reserve differ only by wild-plant count, which blueprints
    // can't express: in the overlapping 32–64 size window we report park with
    // possibleUpgrade natureReserve.
    upgradeUnverifiable: true,
    caveats: 'wild-plant requirement not representable in blueprints; treated as satisfied',
  },
  {
    id: 'kitchen',
    family: 'kitchen',
    tier: 1,
    minSize: 12,
    maxSize: 96,
    requires: [
      { kind: 'tag', tag: 'SpiceStation', min: 1 },
      { kind: 'tag', tag: 'CookTop', min: 1 },
      { kind: 'tag', tag: 'KitchenRefrigerator', min: 1 },
      { kind: 'tag', tag: 'DiningTableType', max: 0 },
    ],
  },
  {
    id: 'powerPlant',
    family: 'power',
    tier: 1,
    minSize: 12,
    maxSize: 96,
    requires: [{ kind: 'tag', tag: 'MachineShopType', min: 1 }],
  },
  {
    id: 'greenhouse',
    family: 'agriculture:greenhouse',
    tier: 1,
    minSize: 12,
    maxSize: 96,
    requires: [{ kind: 'tag', tag: 'FarmStationType', min: 1 }],
  },
  {
    id: 'laboratory',
    family: 'science',
    tier: 1,
    minSize: 32,
    maxSize: 120,
    requires: [{ kind: 'tag', tag: 'ScienceBuilding', min: 2 }, NO_INDUSTRIAL],
  },
  {
    id: 'stable',
    family: 'agriculture:stable',
    tier: 1,
    minSize: 12,
    maxSize: 96,
    requires: [{ kind: 'tag', tag: 'RanchStationType', min: 1 }],
  },
];

// Cavities larger than this are never rooms (mirrors the game's cavity cap; the
// largest named room is 120 cells).
export const MAX_ROOM_SIZE = 128;

// Blueprints whose bounding box exceeds this many cells skip detection entirely
// (status 'too-large') — well beyond any legitimate room-focused blueprint.
export const MAX_DETECTION_AREA = 65_536; // 256 × 256

// Player-buildable doors. Doors bound rooms like tiles do, but the export has no
// "door" flag (Pneumatic Door is not even isFoundation), so the list is curated.
// Door cells never count toward room size. POI/dev doors excluded.
export const ROOM_BOUNDARY_DOORS: ReadonlySet<string> = new Set([
  'Door', // Pneumatic Door
  'ManualPressureDoor',
  'PressureDoor',
  'BunkerDoor',
  'WoodenDoor',
  'InsulatedDoor',
]);

// Every room tag the rule table references — the converter validates each maps to
// at least one building in the export (guards against Klei renaming tags).
export const ROOM_TAGS_USED: readonly string[] = Array.from(
  new Set(
    ROOM_DEFINITIONS.flatMap(def =>
      def.requires.flatMap(c => (c.kind === 'tag' ? [c.tag] : []))
    ).concat(['BedType', 'LuxuryBedType']) // used by the noNonLuxuryBed constraint
  )
).sort();
