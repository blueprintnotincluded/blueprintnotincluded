import { describe, it, expect, beforeEach } from "vitest";
import {
  BTerrainFeature,
  BuildableElement,
  CellStackEntry,
  ElementState,
  TerrainFeature,
} from "../../../../../../lib/index";
import {
  HoverCardContext,
  MAX_HOVER_CARDS,
  breathability,
  formatCelsius,
  hoverCardContent,
} from "./hover-card-content";

const OXYGEN_TAG = 1960575215;

const CONTEXT: HoverCardContext = {
  isSelected: () => false,
  gameString: (key) =>
    ({
      "STRINGS.MISC.PLACERS.DIGPLACER.NAME": "Dig",
      "STRINGS.ELEMENTS.STATE.GAS": "Gas",
      "STRINGS.ELEMENTS.STATE.SOLID": "Solid",
    })[key],
};

const CATALOGUE: BTerrainFeature[] = [
  {
    id: "GeyserGeneric_steam",
    name: "Cool Steam Vent",
    width: 2,
    height: 4,
    dlcIds: [],
    activeTile: { x: 0, y: 1 },
  },
];

function building(overrides: Record<string, any> = {}): any {
  return {
    id: "Wire",
    oniItem: { id: "Wire", name: "Wire", isElement: false },
    buildableElements: [{ name: "Copper" }],
    tempDisabled: false,
    buildingData: undefined,
    ...overrides,
  };
}

function cardFor(entry: CellStackEntry, cell = { x: 0, y: 0 }) {
  return hoverCardContent([entry], cell, CONTEXT).cards[0];
}

describe("hoverCardContent", () => {
  beforeEach(() => {
    BuildableElement.init();
    BuildableElement.load([
      {
        id: "Oxygen",
        name: "Oxygen",
        tag: OXYGEN_TAG,
        state: ElementState.Gas,
      } as unknown as BuildableElement,
      {
        id: "ContaminatedOxygen",
        name: "Polluted Oxygen",
        tag: 3,
        state: ElementState.Gas,
      } as unknown as BuildableElement,
      {
        id: "Hydrogen",
        name: "Hydrogen",
        tag: 4,
        state: ElementState.Gas,
      } as unknown as BuildableElement,
      {
        id: "Vacuum",
        name: "Vacuum",
        tag: 2,
        state: ElementState.Vacuum,
      } as unknown as BuildableElement,
    ]);
    TerrainFeature.init();
    TerrainFeature.load(CATALOGUE);
  });

  describe("building", () => {
    it("is the name with its material, and no bullets by default", () => {
      expect(cardFor({ kind: "building", ref: building() })).toEqual({
        header: "Wire",
        material: "Copper",
        bullets: [],
        selected: false,
      });
    });

    it("says Disabled when the building is disabled", () => {
      const card = cardFor({
        kind: "building",
        ref: building({ tempDisabled: true }),
      });
      expect(card.bullets).toEqual([{ text: "Disabled" }]);
    });

    it("lists the materials after the first on one line", () => {
      const card = cardFor({
        kind: "building",
        ref: building({
          oniItem: { name: "Mechanized Airlock", isElement: false },
          buildableElements: [{ name: "Copper" }, { name: "Plastic" }],
          tempDisabled: true,
        }),
      });
      expect(card.material).toBe("Copper");
      expect(card.bullets).toEqual([
        { text: "Also: ", accent: "Plastic" },
        { text: "Disabled" },
      ]);
    });

    it("leads with the canonical setting, element resolved, priority skipped", () => {
      BuildableElement.elements.find((e) => e.id == "Oxygen")!.name =
        "Oxygen (resolved)";
      const card = cardFor({
        kind: "building",
        ref: building({
          id: "GasFilter",
          oniItem: { id: "GasFilter", name: "Gas Filter", isElement: false },
          buildingData: [
            { Key: "Prioritizable", Value: { masterPriority: 5 } },
            { Key: "Switch", Value: { switchedOn: true } },
            { Key: "Filterable", Value: { SelectedTag: "Oxygen" } },
          ],
        }),
      });
      expect(card.bullets).toEqual([
        { text: "Element: ", accent: "Oxygen (resolved)" },
      ]);
    });

    it("falls back to the first setting the catalogue can format", () => {
      const card = cardFor({
        kind: "building",
        ref: building({
          id: "LogicSwitch",
          buildingData: [
            { Key: "SomeModKey", Value: { a: 1 } },
            { Key: "Switch", Value: { switchedOn: false } },
          ],
        }),
      });
      expect(card.bullets).toEqual([{ text: "On: ", accent: "Off" }]);
    });
  });

  it("explains a dig", () => {
    expect(cardFor({ kind: "dig", ref: { x: 0, y: 0 } })).toEqual({
      header: "Dig",
      bullets: [{ text: "Dug out when placed in game" }],
      selected: false,
    });
  });

  it("gives an element cell its state, mass and temperature", () => {
    const card = cardFor({
      kind: "element",
      ref: {
        buildableElements: [BuildableElement.getElementById("Oxygen")],
        mass: 1.5,
        temperature: 293.15,
      } as any,
    });
    expect(card.header).toBe("Oxygen");
    expect(card.bullets.map((b) => b.text)).toEqual([
      "Gas",
      "1500 Grams",
      "20 °C",
    ]);
  });

  it("rates oxygen and polluted oxygen for breathing after the mass", () => {
    const massBullet = (id: string, mass: number) =>
      cardFor({
        kind: "element",
        ref: {
          buildableElements: [BuildableElement.getElementById(id)],
          mass,
          temperature: 293.15,
        } as any,
      }).bullets[1];

    expect(massBullet("Oxygen", 1.6395)).toEqual({
      text: "1640 Grams",
      accent: " (Very Breathable)",
    });
    expect(massBullet("ContaminatedOxygen", 0.6).accent).toBe(" (Breathable)");
    expect(massBullet("Hydrogen", 10)).toEqual({ text: "10 Kg" });
  });

  it("bands breathability at the game's cutoffs", () => {
    const at = (kg: number) => breathability(kg, CONTEXT);
    expect(at(1)).toBe("Very Breathable");
    expect(at(0.999)).toBe("Breathable");
    expect(at(0.525)).toBe("Breathable");
    expect(at(0.5249)).toBe("Barely Breathable");
    expect(at(0.05)).toBe("Barely Breathable");
    expect(at(0.0499)).toBe("Unbreathable");
    expect(at(0)).toBe("Unbreathable");
  });

  it("resolves an element note by its tag", () => {
    const card = cardFor({
      kind: "elementNote",
      ref: { x: 0, y: 0, type: 1, id: OXYGEN_TAG, mass: 10, temp: 300 },
    });
    expect(card.header).toBe("Oxygen");
    expect(card.bullets.map((b) => b.text)).toEqual([
      "Gas",
      "10 Kg",
      "26.9 °C",
    ]);
  });

  it("gives a vacuum no mass or temperature", () => {
    const card = cardFor({
      kind: "elementNote",
      ref: { x: 0, y: 0, type: 1, id: 2, mass: 0, temp: 0 },
    });
    expect(card.header).toBe("Vacuum");
    expect(card.bullets).toHaveLength(1);
  });

  it("names an element note it cannot resolve", () => {
    const card = cardFor({
      kind: "elementNote",
      ref: { x: 0, y: 0, type: 1, id: 12345 },
    });
    expect(card.header).toBe("Unknown element");
  });

  it("titles a text note and shows its first non-blank line", () => {
    const card = cardFor({
      kind: "note",
      ref: {
        x: 0,
        y: 0,
        type: 0,
        title: "<b>Pump</b> room",
        text: "\n  \nKeep <color=#ff0000>dry</color>\nsecond line",
      },
    });
    expect(card).toEqual({
      header: "Pump room",
      bullets: [{ text: "Keep dry" }],
      selected: false,
    });
  });

  it("calls an untitled text note a Note", () => {
    const card = cardFor({ kind: "note", ref: { x: 0, y: 0, type: 0 } });
    expect(card).toEqual({ header: "Note", bullets: [], selected: false });
  });

  it("says where a terrain feature erupts, on that cell only", () => {
    const feature = { id: "GeyserGeneric_steam", x: 10, y: 10 };
    expect(
      cardFor({ kind: "terrain", ref: feature }, { x: 10, y: 11 }),
    ).toEqual({
      header: "Cool Steam Vent",
      bullets: [{ text: "Erupts here" }],
      selected: false,
    });
    expect(
      cardFor({ kind: "terrain", ref: feature }, { x: 11, y: 11 }).bullets,
    ).toEqual([]);
  });

  it("marks only the entries the context calls selected", () => {
    const wire = building();
    const tile = building({ id: "Tile", oniItem: { name: "Tile" } });
    const content = hoverCardContent(
      [
        { kind: "building", ref: wire },
        { kind: "building", ref: tile },
      ],
      { x: 0, y: 0 },
      { ...CONTEXT, isSelected: (entry) => entry.ref === tile },
    );
    expect(content.cards.map((card) => card.selected)).toEqual([false, true]);
  });

  it("caps the list and counts the rest", () => {
    const entries: CellStackEntry[] = Array.from({ length: 11 }, () => ({
      kind: "dig",
      ref: { x: 0, y: 0 },
    }));
    const content = hoverCardContent(entries, { x: 0, y: 0 }, CONTEXT);
    expect(content.cards).toHaveLength(MAX_HOVER_CARDS);
    expect(content.more).toBe(11 - MAX_HOVER_CARDS);
  });

  it("formats Kelvin as Celsius to one decimal", () => {
    expect(formatCelsius(273.15)).toBe("0 °C");
    expect(formatCelsius(306.95)).toBe("33.8 °C");
    expect(formatCelsius(0)).toBe("-273.1 °C");
  });
});
