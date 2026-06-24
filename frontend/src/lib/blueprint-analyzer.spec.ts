import { describe, it, expect } from "vitest";
import { deriveGameVersion, deriveModded } from "../../../lib/index";

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
      "bionicBooster"
    );
  });

  it("frostyPlanet beats spacedOut", () => {
    expect(deriveGameVersion([["DLC2_ID"], ["EXPANSION1_ID"]])).toBe(
      "frostyPlanet"
    );
  });

  it("bionicBooster beats frostyPlanet", () => {
    expect(deriveGameVersion([["DLC5_ID"], ["DLC2_ID"]])).toBe("bionicBooster");
  });

  it("ignores unknown DLC IDs and still returns correct version", () => {
    expect(deriveGameVersion([["UNKNOWN_DLC", "EXPANSION1_ID"]])).toBe(
      "spacedOut"
    );
  });

  it("returns base when all DLC IDs are unknown", () => {
    expect(deriveGameVersion([["UNKNOWN_DLC"]])).toBe("base");
  });
});

describe("deriveModded", () => {
  const knownIds = new Set(["WireRefinedHighWattage", "GasPipe", "LiquidPipe"]);

  it("returns false when all building IDs are known", () => {
    expect(deriveModded(["WireRefinedHighWattage", "GasPipe"], knownIds)).toBe(
      false
    );
  });

  it("returns true when any building ID is unknown", () => {
    expect(
      deriveModded(["WireRefinedHighWattage", "ModdedSuperFurnace"], knownIds)
    ).toBe(true);
  });

  it("returns false for an empty blueprint", () => {
    expect(deriveModded([], knownIds)).toBe(false);
  });

  it("returns true when all buildings are unknown", () => {
    expect(deriveModded(["Mod1", "Mod2"], knownIds)).toBe(true);
  });

  it("single unknown building triggers modded", () => {
    expect(
      deriveModded(["LiquidPipe", "GasPipe", "Unknown123"], knownIds)
    ).toBe(true);
  });
});
