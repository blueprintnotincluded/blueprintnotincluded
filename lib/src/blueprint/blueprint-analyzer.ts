import { CATEGORIES, Category } from './blueprint-metadata';
import { DlcId } from './dlc';

// The set of DLCs a blueprint needs in order to be built: the union of every
// placed building's dlcIds, deduped and sorted so storage and diffs are stable.
// [] means base game only.
//
// Multiple ids on one building are AND ("needs all" — RoboPilotModule requires
// both Spaced Out and the Bionic Booster Pack), which makes a plain union the
// correct composition across buildings, with no special cases: EXPANSION1_ID is
// treated exactly like every other id. Requirements come from the blueprint's
// content, never from the author's own setup.
//
export function deriveRequiredDlcs(buildingDlcIds: DlcId[][]): DlcId[] {
  const required = new Set<DlcId>();
  for (const dlcIds of buildingDlcIds) for (const dlcId of dlcIds) required.add(dlcId);
  return [...required].sort();
}

// Distinct, sorted workshop ids of the mods a blueprint's buildings come from.
// modByPrefabId: prefabId -> workshop id, built from the loaded database
// (entries whose building has `mod` set). Unknown prefab ids contribute nothing
// here — they're the unknown-id leg of deriveModded.
export function deriveBlueprintMods(
  prefabIds: string[],
  modByPrefabId: Map<string, string>
): string[] {
  const mods = new Set<string>();
  for (const id of prefabIds) {
    const mod = modByPrefabId.get(id);
    if (mod !== undefined) mods.add(mod);
  }
  return [...mods].sort();
}

// True when the blueprint uses any known-mod building OR contains ids unknown
// to the database (mods we don't ship, or buildings stripped at import — the
// caller may also OR in Blueprint.hadUnknownBuildings for the stripped case).
export function deriveModded(
  prefabIds: string[],
  knownIds: Set<string>,
  modByPrefabId: Map<string, string>
): boolean {
  return (
    deriveBlueprintMods(prefabIds, modByPrefabId).length > 0 ||
    prefabIds.some(id => !knownIds.has(id))
  );
}

// --- Trending "hot score" ----------------------------------------------
//
// A materialized, indexable trending score: "new but also good". Unlike a
// time-decay score that references the current clock, time enters here only as
// the blueprint's own createdAt, so the value is STATIC per document and only
// needs recomputing when engagement (ratings/downloads) changes — which lets
// it be stored and sorted on a plain index instead of a full-collection
// aggregation. Newer blueprints are minted with a higher recency term and
// naturally sort above older ones as content flows in; nothing has to decay.
//
// Design rationale, worked examples, and calibration: spec/trending-hotscore-plan.md.

export interface HotScoreInputs {
  ratingCount: number; // number of ratings (v)
  ratingAverage: number; // mean rating 1..5 (R)
  downloadCount: number; // lifetime downloads (d)
  createdAt: Date;
}

// All tunables live here — changing any is a one-line edit; re-run the backfill
// migration (blueprint-hotscore-backfill) to re-materialize stored scores.
export const HOT_SCORE = {
  // Bayesian shrinkage: blend each blueprint's average toward a prior so a
  // brand-new 1-vote 5★ can't rocket to the top. PRIOR_MEAN is provisional —
  // ratings are too new to have a meaningful mean yet (see spec §6).
  PRIOR_MEAN: 3.5, // C — prior/global mean rating
  SHRINK_VOTES: 3, // m — prior votes blended in
  // Signal weights.
  W_RATING: 1.0, // bayesianRating spans ~2.5–5
  W_DOWNLOAD: 0.5, // log10(downloads+1) spans ~0–3.5
  // Recency in quality-points per day of newness. 0.18 gives a ~2-week
  // visibility window for a great blueprint (spec §3).
  W_RECENCY: 0.18,
  // Convert createdAt to epoch-days for the (static) recency term.
  MS_PER_DAY: 86_400_000,
} as const;

// Noise-resistant quality: an IMDb-style weighted rating that pulls
// low-vote-count averages toward the prior mean. 0 votes → exactly PRIOR_MEAN.
export function bayesianRating(ratingCount: number, ratingAverage: number): number {
  const v = Math.max(0, ratingCount);
  const m = HOT_SCORE.SHRINK_VOTES;
  return (v / (v + m)) * ratingAverage + (m / (v + m)) * HOT_SCORE.PRIOR_MEAN;
}

// Materialized trending score. Higher = more "trending". See HotScoreInputs.
export function computeHotScore(i: HotScoreInputs): number {
  const quality =
    HOT_SCORE.W_RATING * bayesianRating(i.ratingCount, i.ratingAverage) +
    HOT_SCORE.W_DOWNLOAD * Math.log10(Math.max(0, i.downloadCount) + 1);
  const recency = HOT_SCORE.W_RECENCY * (i.createdAt.getTime() / HOT_SCORE.MS_PER_DAY);
  return quality + recency;
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
export const SIGNATURE_PREFABS: Record<string, SignatureVote[]> = {
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

  // transit — duplicant transit only.
  //
  // SolidTransferArm (auto-sweeper) and SolidConduit (conveyor rail) used to
  // sit here at weight 3 and 1, and between them they turned transit into the
  // site's junk bucket: 624 blueprints containing paku farms, boilers, ranches,
  // research labs and geyser tamers. Conveyor logistics is a *supporting*
  // system — a sweeper feeds a ranch, a rail carries ore out of a refinery — so
  // its presence says nothing about what a blueprint is for, and stacked
  // (3 + 1 + the capped conveyance fallback) it out-scored the appliance that
  // actually defined the build.
  //
  // Both are still conveyance in the game's own menu, so they keep voting via
  // FALLBACK_GAME_CATEGORY: a blueprint that is genuinely nothing but rails and
  // sweepers reaches the capped 2 and still tags transit, but it now loses to
  // any real appliance. Travel tubes stay at 3 — moving duplicants IS the
  // purpose of the build that contains them.
  TravelTube: [{ category: 'transit', weight: 3 }],
  TravelTubeEntrance: [{ category: 'transit', weight: 3 }],

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

// Fallback votes are worth 1 per unique prefab and used to accumulate without
// limit, so incidental infrastructure could out-vote a real appliance: a
// blueprint carrying a dozen distinct logic pieces scored 12 on automation and
// beat a petroleum generator's signature 3. On the live corpus that made
// automation and transit — the two most incidental systems in the game — the
// two largest buckets.
//
// Capping the per-category fallback total at MIN_CATEGORY_SCORE keeps a
// genuinely fallback-only build taggable (an all-logic blueprint still reaches
// the threshold and tags automation, as do the decor-only fixtures) while
// guaranteeing a signature building always wins when one is present. Signature
// votes are deliberately left uncapped — they're curated per prefab.
const MAX_FALLBACK_SCORE = MIN_CATEGORY_SCORE;

// Returns the best-scoring function category for a blueprint's buildings, or
// null ("Untagged") when there isn't enough signal. Duplicate prefabs count
// once — a SPOM with 4 electrolyzers isn't 4x more oxygen-y than one with 1.
export function deriveCategory(prefabIds: string[], lookup: CategoryLookup): Category | null {
  const uniqueIds = new Set(prefabIds);
  const signatureScores = new Map<Category, number>();
  const fallbackScores = new Map<Category, number>();
  const addScore = (target: Map<Category, number>, category: Category, weight: number) =>
    target.set(category, (target.get(category) ?? 0) + weight);

  for (const id of uniqueIds) {
    const signature = SIGNATURE_PREFABS[id];
    if (signature) {
      for (const vote of signature) addScore(signatureScores, vote.category, vote.weight);
      continue;
    }

    const gameCategory = lookup.gameCategoryByPrefabId.get(id);
    const mapped = gameCategory !== undefined ? FALLBACK_GAME_CATEGORY[gameCategory] : undefined;
    if (mapped !== undefined) addScore(fallbackScores, mapped, 1);
  }

  const scores = new Map<Category, number>();
  for (const category of CATEGORIES) {
    const signatureScore = signatureScores.get(category) ?? 0;
    const fallbackScore = Math.min(fallbackScores.get(category) ?? 0, MAX_FALLBACK_SCORE);
    if (signatureScore + fallbackScore > 0) scores.set(category, signatureScore + fallbackScore);
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
