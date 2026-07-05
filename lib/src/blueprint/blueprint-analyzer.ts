import { CATEGORIES, Category, GAME_VERSIONS, GameVersion } from './blueprint-metadata';

// Raw DLC ID strings as exported by OniExtract2024.
type DlcId = string;

const DLC_TO_GAME_VERSION: Record<string, GameVersion> = {
  EXPANSION1_ID: 'spacedOut',
  DLC2_ID: 'frostyPlanet',
  DLC5_ID: 'bionicBooster',
};

// Returns the minimum game version required to use a blueprint, based on which
// DLC IDs each building requires. Priority follows the GAME_VERSIONS order
// (highest index wins). Unknown DLC IDs are ignored.
export function deriveGameVersion(buildingDlcIds: DlcId[][]): GameVersion {
  let best = 0; // index into GAME_VERSIONS
  for (const dlcIds of buildingDlcIds) {
    for (const dlcId of dlcIds) {
      const version = DLC_TO_GAME_VERSION[dlcId];
      if (version === undefined) continue;
      const idx = GAME_VERSIONS.indexOf(version);
      if (idx > best) best = idx;
    }
  }
  return GAME_VERSIONS[best];
}

// Returns true when any building ID in the blueprint is not in the known set.
// The known set is built from the loaded database (OniItem.oniItemsMap or the
// database JSON). Blueprints with unknown IDs were created with mods.
export function deriveModded(prefabIds: string[], knownIds: Set<string>): boolean {
  return prefabIds.some(id => !knownIds.has(id));
}

// --- Category derivation -----------------------------------------------
//
// The game's own buildMenuCategories/buildMenuItems taxonomy is a build-menu
// grouping, not a function grouping (e.g. AirConditioner and SteamTurbine2 —
// both used for cooling in practice — land in "utilities" and "power"
// respectively). A pure "dominant game category" vote misclassifies exactly
// the categories users care about, so signature prefabs (hardcoded below)
// are scored first and the game-category vote is only a fallback for
// prefabs with no signature match.

export interface CategoryLookup {
  // buildingId -> game buildMenuCategories.categoryName
  gameCategoryByPrefabId: Map<string, string>;
}

interface BuildMenuCategoryLike {
  category: number;
  categoryName: string;
}
interface BuildMenuItemLike {
  category: number;
  buildingId: string;
}

// Joins the raw buildMenuCategories/buildMenuItems tables (as loaded from
// database-2024.json, on frontend or backend) into a CategoryLookup.
export function buildCategoryLookup(
  buildMenuCategories: BuildMenuCategoryLike[],
  buildMenuItems: BuildMenuItemLike[]
): CategoryLookup {
  const categoryNameById = new Map<number, string>();
  for (const c of buildMenuCategories) categoryNameById.set(c.category, c.categoryName);

  const gameCategoryByPrefabId = new Map<string, string>();
  for (const item of buildMenuItems) {
    const name = categoryNameById.get(item.category);
    if (name !== undefined) gameCategoryByPrefabId.set(item.buildingId, name);
  }

  return { gameCategoryByPrefabId };
}

interface SignatureVote {
  category: Category;
  weight: number;
}

// Hardcoded, weighted map of prefabs that strongly signal a function-based
// category regardless of which build-menu tab the game puts them under.
// Weight defaults to 3 (a strong signal on its own); weight 1 marks prefabs
// shared with another category, or building types that appear in almost
// every blueprint of that function but aren't unique to it.
const SIGNATURE_PREFABS: Record<string, SignatureVote[]> = {
  // oxygenGen
  Electrolyzer: [{ category: 'oxygenGen', weight: 3 }],
  MineralDeoxidizer: [{ category: 'oxygenGen', weight: 3 }],
  AlgaeHabitat: [{ category: 'oxygenGen', weight: 3 }],
  RustDeoxidizer: [{ category: 'oxygenGen', weight: 3 }],
  SublimationStation: [{ category: 'oxygenGen', weight: 3 }],
  Oxysconce: [{ category: 'oxygenGen', weight: 3 }],

  // cooling
  AirConditioner: [{ category: 'cooling', weight: 3 }],
  LiquidConditioner: [{ category: 'cooling', weight: 3 }],
  SteamTurbine2: [{ category: 'cooling', weight: 3 }, { category: 'power', weight: 1 }],
  IceCooledFan: [{ category: 'cooling', weight: 3 }],
  IceMachine: [{ category: 'cooling', weight: 3 }],
  ThermalBlock: [{ category: 'cooling', weight: 1 }],

  // power
  Generator: [{ category: 'power', weight: 3 }],
  ManualGenerator: [{ category: 'power', weight: 3 }],
  HydrogenGenerator: [{ category: 'power', weight: 3 }],
  MethaneGenerator: [{ category: 'power', weight: 3 }],
  PetroleumGenerator: [{ category: 'power', weight: 3 }],
  WoodGasGenerator: [{ category: 'power', weight: 3 }],
  SolarPanel: [{ category: 'power', weight: 3 }],
  Battery: [{ category: 'power', weight: 1 }],
  BatteryMedium: [{ category: 'power', weight: 1 }],
  BatterySmart: [{ category: 'power', weight: 1 }],
  BatteryModule: [{ category: 'power', weight: 1 }],

  // ranching
  RanchStation: [{ category: 'ranching', weight: 3 }],
  ShearingStation: [{ category: 'ranching', weight: 3 }],
  EggIncubator: [{ category: 'ranching', weight: 3 }],
  EggCracker: [{ category: 'ranching', weight: 1 }],
  CreatureFeeder: [{ category: 'ranching', weight: 1 }],
  CreatureDeliveryPoint: [{ category: 'ranching', weight: 3 }],
  FishFeeder: [{ category: 'ranching', weight: 3 }],
  FishDeliveryPoint: [{ category: 'ranching', weight: 3 }],

  // food
  FarmTile: [{ category: 'food', weight: 1 }],
  HydroponicFarm: [{ category: 'food', weight: 1 }],
  PlanterBox: [{ category: 'food', weight: 1 }],
  MicrobeMusher: [{ category: 'food', weight: 3 }],
  CookingStation: [{ category: 'food', weight: 3 }],
  GourmetCookingStation: [{ category: 'food', weight: 3 }],
  Refrigerator: [{ category: 'food', weight: 1 }],
  FarmStation: [{ category: 'food', weight: 3 }],

  // transit
  TravelTube: [{ category: 'transit', weight: 3 }],
  TravelTubeEntrance: [{ category: 'transit', weight: 3 }],
  SolidConduit: [{ category: 'transit', weight: 1 }],
  SolidTransferArm: [{ category: 'transit', weight: 3 }],

  // refining
  MetalRefinery: [{ category: 'refining', weight: 3 }],
  GlassForge: [{ category: 'refining', weight: 3 }],
  OilRefinery: [{ category: 'refining', weight: 3 }],
  Polymerizer: [{ category: 'refining', weight: 3 }],
  RockCrusher: [{ category: 'refining', weight: 3 }],
  Kiln: [{ category: 'refining', weight: 3 }],
  SludgePress: [{ category: 'refining', weight: 3 }],

  // rooms
  LuxuryBed: [{ category: 'rooms', weight: 3 }],
  Bed: [{ category: 'rooms', weight: 3 }],
  MedicalCot: [{ category: 'rooms', weight: 3 }],
  DoctorStation: [{ category: 'rooms', weight: 3 }],
  Apothecary: [{ category: 'rooms', weight: 3 }],
  WaterCooler: [{ category: 'rooms', weight: 1 }],
  ArcadeMachine: [{ category: 'rooms', weight: 3 }],
  SodaFountain: [{ category: 'rooms', weight: 3 }],
};

// Fallback: game buildMenuCategories.categoryName -> our Category, weight 1.
// Only mapped where the game's grouping reliably tracks function; base,
// plumbing, utilities, equipment, rocketry and hep are infrastructure or too
// ambiguous (see SIGNATURE_PREFABS caveats above) and contribute nothing.
//
// hvac is deliberately absent: in the 2024 export it's gas-conduit plumbing
// (GasPump, GasConduit, GasVent, valves/sensors — verified against
// database-2024.json), not temperature control, so mapping it to cooling
// misclassified any gas-plumbing-heavy blueprint (e.g. a bare SPOM with no
// actual cooling building) as cooling. Real cooling appliances are covered
// by SIGNATURE_PREFABS instead.
const FALLBACK_GAME_CATEGORY: Partial<Record<string, Category>> = {
  oxygen: 'oxygenGen',
  power: 'power',
  refining: 'refining',
  automation: 'automation',
  conveyance: 'transit',
  furniture: 'decor',
  food: 'food',
  medical: 'rooms',
};

// A single weak fallback vote (weight 1) shouldn't tag a mostly-tile/wire
// blueprint; require the winning category to clear this score.
const MIN_CATEGORY_SCORE = 2;

// Returns the best-scoring function category for a blueprint's buildings, or
// null ("Untagged") when there isn't enough signal. Duplicate prefabs count
// once — a SPOM with 4 electrolyzers isn't 4x more oxygen-y than one with 1.
export function deriveCategory(prefabIds: string[], lookup: CategoryLookup): Category | null {
  const uniqueIds = new Set(prefabIds);
  const scores = new Map<Category, number>();
  const addScore = (category: Category, weight: number) =>
    scores.set(category, (scores.get(category) ?? 0) + weight);

  for (const id of uniqueIds) {
    const signature = SIGNATURE_PREFABS[id];
    if (signature) {
      for (const vote of signature) addScore(vote.category, vote.weight);
      continue;
    }

    const gameCategory = lookup.gameCategoryByPrefabId.get(id);
    const mapped = gameCategory !== undefined ? FALLBACK_GAME_CATEGORY[gameCategory] : undefined;
    if (mapped !== undefined) addScore(mapped, 1);
  }

  let best: Category | null = null;
  let bestScore = 0;
  for (const category of CATEGORIES) {
    const score = scores.get(category) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }

  return bestScore >= MIN_CATEGORY_SCORE ? best : null;
}
