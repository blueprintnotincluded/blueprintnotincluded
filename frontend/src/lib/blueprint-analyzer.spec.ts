import { describe, it, expect } from "vitest";
import db from "../assets/database/database-2024.json";
import {
  deriveGameVersion,
  deriveModded,
  deriveBlueprintMods,
  deriveCategory,
  buildCategoryLookup,
  CATEGORIES,
  CategoryLookup,
  SIGNATURE_PREFABS,
} from "../../../lib/index";

describe("deriveGameVersion", () => {
  it("returns base for an empty blueprint", () => {
    expect(deriveGameVersion([])).toBe("base");
  });

  it("returns base when all buildings have no DLC requirements", () => {
    expect(deriveGameVersion([[], [], []])).toBe("base");
  });

  it("returns spacedOut for a building requiring EXPANSION1_ID", () => {
    expect(deriveGameVersion([["EXPANSION1_ID"]])).toBe("spacedOut");
  });

  it("returns frostyPlanet for a building requiring DLC2_ID", () => {
    expect(deriveGameVersion([["DLC2_ID"]])).toBe("frostyPlanet");
  });

  it("returns bionicBooster for a building requiring DLC5_ID", () => {
    expect(deriveGameVersion([["DLC5_ID"]])).toBe("bionicBooster");
  });

  it("returns the highest-priority version when buildings span multiple DLCs", () => {
    expect(deriveGameVersion([["EXPANSION1_ID"], ["DLC5_ID"], []])).toBe(
      "bionicBooster",
    );
  });

  it("frostyPlanet beats spacedOut", () => {
    expect(deriveGameVersion([["DLC2_ID"], ["EXPANSION1_ID"]])).toBe(
      "frostyPlanet",
    );
  });

  it("bionicBooster beats frostyPlanet", () => {
    expect(deriveGameVersion([["DLC5_ID"], ["DLC2_ID"]])).toBe("bionicBooster");
  });

  it("ignores unknown DLC IDs and still returns correct version", () => {
    expect(deriveGameVersion([["UNKNOWN_DLC", "EXPANSION1_ID"]])).toBe(
      "spacedOut",
    );
  });

  it("returns base when all DLC IDs are unknown", () => {
    expect(deriveGameVersion([["UNKNOWN_DLC"]])).toBe("base");
  });
});

describe("deriveModded", () => {
  const knownIds = new Set(["WireRefinedHighWattage", "GasPipe", "LiquidPipe"]);
  const noMods = new Map<string, string>();

  it("returns false when all building IDs are known", () => {
    expect(
      deriveModded(["WireRefinedHighWattage", "GasPipe"], knownIds, noMods),
    ).toBe(false);
  });

  it("returns true when any building ID is unknown", () => {
    expect(
      deriveModded(
        ["WireRefinedHighWattage", "ModdedSuperFurnace"],
        knownIds,
        noMods,
      ),
    ).toBe(true);
  });

  it("returns false for an empty blueprint", () => {
    expect(deriveModded([], knownIds, noMods)).toBe(false);
  });

  it("returns true when all buildings are unknown", () => {
    expect(deriveModded(["Mod1", "Mod2"], knownIds, noMods)).toBe(true);
  });

  it("single unknown building triggers modded", () => {
    expect(
      deriveModded(["LiquidPipe", "GasPipe", "Unknown123"], knownIds, noMods),
    ).toBe(true);
  });

  describe("truth table with known-mod buildings", () => {
    const modByPrefabId = new Map([["PAirlockDoor", "2094698134"]]);

    it("true when a known-mod building is present and all ids are known", () => {
      expect(
        deriveModded(["GasPipe", "PAirlockDoor"], knownIds, modByPrefabId),
      ).toBe(true);
    });

    it("true when an unknown id is present, no known-mod building", () => {
      expect(
        deriveModded(["GasPipe", "Unknown123"], knownIds, modByPrefabId),
      ).toBe(true);
    });

    it("true when both a known-mod building and an unknown id are present", () => {
      expect(
        deriveModded(["PAirlockDoor", "Unknown123"], knownIds, modByPrefabId),
      ).toBe(true);
    });

    it("false when only known vanilla buildings are present", () => {
      expect(
        deriveModded(["GasPipe", "LiquidPipe"], knownIds, modByPrefabId),
      ).toBe(false);
    });
  });
});

describe("deriveBlueprintMods", () => {
  const modByPrefabId = new Map([
    ["PAirlockDoor", "2094698134"],
    ["PAirlockDoorInsulated", "2094698134"],
    ["Drain", "1866754178"],
  ]);

  it("returns [] for a vanilla-only blueprint", () => {
    expect(
      deriveBlueprintMods(["GasPipe", "LiquidPipe"], modByPrefabId),
    ).toEqual([]);
  });

  it("returns the sorted distinct mod ids for a mixed blueprint", () => {
    expect(
      deriveBlueprintMods(["GasPipe", "PAirlockDoor", "Drain"], modByPrefabId),
    ).toEqual(["1866754178", "2094698134"]);
  });

  it("collapses duplicate buildings from the same mod", () => {
    expect(
      deriveBlueprintMods(
        ["PAirlockDoor", "PAirlockDoor", "PAirlockDoorInsulated"],
        modByPrefabId,
      ),
    ).toEqual(["2094698134"]);
  });

  it("ignores ids unknown to the mod map", () => {
    expect(deriveBlueprintMods(["Unknown123"], modByPrefabId)).toEqual([]);
  });
});

describe("deriveCategory", () => {
  // Real database-2024.json — signature prefabs are verified against it below
  // so a future export rename shows up as a failing test, not a silent miss.
  const buildingIds = new Set<string>(db.buildings.map((b: any) => b.prefabId));
  const lookup: CategoryLookup = buildCategoryLookup(
    db.buildMenuCategories,
    db.buildMenuItems,
  );

  // Fixture: one signature building per category that has a signature entry,
  // and two fallback-game-category buildings for the categories that don't
  // (automation, decor — "fallback only" per the spec).
  const FIXTURE_BY_CATEGORY: Record<(typeof CATEGORIES)[number], string[]> = {
    oxygenGen: ["Electrolyzer"],
    power: ["Generator"],
    cooling: ["AirConditioner"],
    food: ["CookingStation"],
    ranching: ["RanchStation"],
    automation: ["LogicSwitch", "LogicDuplicantSensor"],
    transit: ["TravelTube"],
    refining: ["MetalRefinery"],
    rooms: ["Bed"],
    decor: ["FloorLamp", "CeilingLight"],
  };

  it("every signature prefab in the analyzer's table exists in the real database", () => {
    // Covers the full SIGNATURE_PREFABS table (not just the fixture below) so
    // a mistyped or renamed prefab id in a future export fails loudly here
    // instead of silently dropping out of category scoring.
    for (const id of Object.keys(SIGNATURE_PREFABS)) {
      expect(buildingIds.has(id), `${id} missing from database-2024.json`).toBe(
        true,
      );
    }
  });

  for (const category of CATEGORIES) {
    it(`derives ${category} from its representative fixture`, () => {
      expect(deriveCategory(FIXTURE_BY_CATEGORY[category], lookup)).toBe(
        category,
      );
    });
  }

  it("signature beats the fallback game-category vote", () => {
    // Pipes carry no functional signal (plumbing isn't fallback-mapped);
    // a single AirConditioner is the only real signal, and it's cooling
    // even though the game files it under "utilities".
    const prefabIds = ["GasPipe", "LiquidPipe", "GasPipe", "AirConditioner"];
    expect(deriveCategory(prefabIds, lookup)).toBe("cooling");
  });

  it("dedupes repeated prefabs instead of inflating the score", () => {
    const many = Array(4).fill("Electrolyzer");
    const once = ["Electrolyzer"];
    expect(deriveCategory(many, lookup)).toBe(deriveCategory(once, lookup));
    expect(deriveCategory(many, lookup)).toBe("oxygenGen");
  });

  it("returns null for a tile/pipe-only blueprint with no signal", () => {
    expect(
      deriveCategory(["Tile", "GasPipe", "LiquidPipe"], lookup),
    ).toBeNull();
  });

  it("returns null for an empty blueprint", () => {
    expect(deriveCategory([], lookup)).toBeNull();
  });

  it("a single weak fallback vote alone is not enough to tag a blueprint", () => {
    // LogicSwitch alone is one automation fallback vote (weight 1) — below
    // the MIN_CATEGORY_SCORE threshold on its own.
    expect(deriveCategory(["LogicSwitch", "Tile"], lookup)).toBeNull();
  });

  it("ranching signature overrides the game's food-tab placement", () => {
    // EggIncubator/FishFeeder/etc. are filed under the game's "food" build
    // tab but are unambiguously ranching buildings in blueprint terms.
    expect(deriveCategory(["EggIncubator"], lookup)).toBe("ranching");
  });

  it("game category with no fallback mapping contributes nothing", () => {
    // Ladder/Tile are "base"; RanchStation is equipment in-game but has a
    // signature entry — the base-category building shouldn't sway the vote.
    expect(deriveCategory(["Ladder", "RanchStation"], lookup)).toBe("ranching");
  });
});
