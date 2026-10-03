import { RocketStackWarning } from "../../../../../lib/index";
import {
  describeRocketStackWarning,
  describeRocketStackWarnings,
} from "./rocket-stack-messages";

// No game database is loaded in this spec, so a part is named by its prefab id --
// the same fallback the notice uses for a building the database does not know.
describe("rocket stack messages", () => {
  const engine = { prefabId: "KeroseneEngineCluster", x: 21, y: 2 };
  const pad = { prefabId: "LaunchPad", x: 20, y: 0 };

  it("says which way to move a module that missed its hardpoint", () => {
    const text = describeRocketStackWarning({
      kind: "misaligned",
      module: engine,
      hardpointOwner: pad,
      offset: { x: -1, y: 0 },
    });
    expect(text).toContain("KeroseneEngineCluster");
    expect(text).toContain("LaunchPad");
    expect(text).toContain("1 cell left");
  });

  it("combines a horizontal and a vertical correction", () => {
    const text = describeRocketStackWarning({
      kind: "misaligned",
      module: engine,
      hardpointOwner: pad,
      offset: { x: 2, y: -1 },
    });
    expect(text).toContain("2 cells right and 1 cell down");
  });

  it("names the module stacked on a nosecone", () => {
    const text = describeRocketStackWarning({
      kind: "onTopOnly",
      module: { prefabId: "SolidCargoBaySmall", x: 0, y: 6 },
      below: { prefabId: "NoseconeBasic", x: 0, y: 4 },
    });
    expect(text).toContain("SolidCargoBaySmall");
    expect(text).toContain("NoseconeBasic");
    expect(text).toContain("top of its rocket");
  });

  it("gives the height and the engine's limit", () => {
    const text = describeRocketStackWarning({
      kind: "tooTall",
      engine: { prefabId: "CO2Engine", x: 0, y: 0 },
      height: 12,
      maxHeight: 10,
    });
    expect(text).toContain("12");
    expect(text).toContain("10");
    expect(text).toContain("CO2Engine");
  });

  it("has a sentence for every kind of warning", () => {
    const one = { prefabId: "A", x: 0, y: 0 };
    const all: RocketStackWarning[] = [
      {
        kind: "misaligned",
        module: one,
        hardpointOwner: one,
        offset: { x: 1, y: 0 },
      },
      { kind: "onTopOnly", module: one, below: one },
      { kind: "engineNotOnBottom", module: one, below: one },
      { kind: "multipleEngines", modules: [one, one] },
      { kind: "multipleCommandModules", modules: [one, one] },
      { kind: "multipleRoboPilots", modules: [one, one] },
      { kind: "tooTall", engine: one, height: 2, maxHeight: 1 },
    ];
    for (const warning of all)
      expect(
        describeRocketStackWarning(warning).length,
        warning.kind,
      ).toBeGreaterThan(10);
  });

  it("spells out the first three and counts the rest", () => {
    const warning: RocketStackWarning = {
      kind: "engineNotOnBottom",
      module: engine,
      below: pad,
    };
    const text = describeRocketStackWarnings([
      warning,
      warning,
      warning,
      warning,
      warning,
    ]);
    expect(text.match(/bottom module/g)).toHaveLength(3);
    expect(text).toContain("And 2 more.");
    expect(describeRocketStackWarnings([warning])).not.toContain("more");
  });
});
