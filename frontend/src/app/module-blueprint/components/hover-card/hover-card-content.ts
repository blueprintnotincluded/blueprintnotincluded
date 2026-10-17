import {
  BlueprintItem,
  BlueprintItemElement,
  BniTerrainFeature,
  BniWorldNote,
  BuildableElement,
  CellStackEntry,
  ElementState,
  activeTileOf,
  formatBuildingDataEntry,
  primarySettingsKey,
  resolveSettingDescriptors,
  stripNoteMarkup,
  terrainDisplayName,
} from "../../../../../../lib/index";
import { AddMassUnitPipe } from "../../pipes/add-mass-unit.pipe";

// What each card on the hover card says. One card per thing on the cell,
// each a header and at most three bullets, laid out like the game's own
// hover card.

export interface HoverCardBullet {
  text: string;
  // A value drawn in the accent colour after the text.
  accent?: string;
}

export interface HoverCard {
  header: string;
  // The game's BUILDING_HOVER_NAME_FMT: `{Name}    ({Element})`.
  material?: string;
  bullets: HoverCardBullet[];
  // Drawn with the orange border: this entry is what the canvas's selection
  // highlight belongs to.
  selected: boolean;
}

export interface HoverCardContent {
  cards: HoverCard[];
  // Entries past the cap, summarised as "+N more".
  more: number;
}

export interface HoverCardContext {
  isSelected(entry: CellStackEntry): boolean;
  // A game string by its STRINGS key, or undefined while they load.
  gameString(key: string): string | undefined;
}

// A blueprint cell rarely holds more than five things; past eight the card
// would run off the screen.
export const MAX_HOVER_CARDS = 8;

const MAX_BULLETS = 3;

// Every building copied from the game carries a priority, so a priority line
// would be on nearly every card and tell nothing apart.
const PRIORITY_KEY = "Prioritizable";

const STATE_KEYS: Record<ElementState, string> = {
  [ElementState.Vacuum]: "STRINGS.ELEMENTS.STATE.VACUUM",
  [ElementState.Gas]: "STRINGS.ELEMENTS.STATE.GAS",
  [ElementState.Liquid]: "STRINGS.ELEMENTS.STATE.LIQUID",
  [ElementState.Solid]: "STRINGS.ELEMENTS.STATE.SOLID",
};

const STATE_FALLBACKS: Record<ElementState, string> = {
  [ElementState.Vacuum]: "None",
  [ElementState.Gas]: "Gas",
  [ElementState.Liquid]: "Liquid",
  [ElementState.Solid]: "Solid",
};

const massPipe = new AddMassUnitPipe();

// The two elements the game rates for breathing, and its cutoffs in kg
// (checked from the top, first match wins), with the oxygen overlay's legend
// strings for the labels.
const BREATHABLE_ELEMENTS = ["Oxygen", "ContaminatedOxygen"];
const BREATHABILITY: { minKg: number; key: string; fallback: string }[] = [
  {
    minKg: 1,
    key: "STRINGS.UI.OVERLAYS.OXYGEN.LEGEND1",
    fallback: "Very Breathable",
  },
  {
    minKg: 0.525,
    key: "STRINGS.UI.OVERLAYS.OXYGEN.LEGEND2",
    fallback: "Breathable",
  },
  {
    minKg: 0.05,
    key: "STRINGS.UI.OVERLAYS.OXYGEN.LEGEND3",
    fallback: "Barely Breathable",
  },
  {
    minKg: -Infinity,
    key: "STRINGS.UI.OVERLAYS.OXYGEN.LEGEND4",
    fallback: "Unbreathable",
  },
];

export function breathability(
  massKg: number,
  context: Pick<HoverCardContext, "gameString">,
): string {
  const band = BREATHABILITY.find((b) => massKg >= b.minKg)!;
  return context.gameString(band.key) ?? band.fallback;
}

export function hoverCardContent(
  entries: CellStackEntry[],
  cell: { x: number; y: number },
  context: HoverCardContext,
): HoverCardContent {
  const shown = entries.slice(0, MAX_HOVER_CARDS);
  return {
    cards: shown.map((entry) => ({
      ...describeEntry(entry, cell, context),
      selected: context.isSelected(entry),
    })),
    more: entries.length - shown.length,
  };
}

function describeEntry(
  entry: CellStackEntry,
  cell: { x: number; y: number },
  context: HoverCardContext,
): Omit<HoverCard, "selected"> {
  switch (entry.kind) {
    case "note":
      return describeTextNote(entry.ref);
    case "terrain":
      return describeTerrain(entry.ref, cell);
    case "building":
      return describeBuilding(entry.ref);
    case "dig":
      return {
        header:
          context.gameString("STRINGS.MISC.PLACERS.DIGPLACER.NAME") ??
          $localize`Dig`,
        bullets: [{ text: $localize`Dug out when placed in game` }],
      };
    case "element": {
      const item: BlueprintItemElement = entry.ref;
      return describeElement(
        item.buildableElements[0],
        item.mass,
        item.temperature,
        context,
      );
    }
    case "elementNote": {
      const note = entry.ref;
      const element =
        note.id != null ? BuildableElement.getElementByTag(note.id) : undefined;
      return describeElement(element, note.mass, note.temp, context);
    }
  }
}

function describeTextNote(note: BniWorldNote): Omit<HoverCard, "selected"> {
  const title = stripNoteMarkup(note.title ?? "");
  const firstLine = (note.text ?? "")
    .split(/\r?\n/)
    .map(stripNoteMarkup)
    .find((line) => line.length > 0);
  return {
    header: title.length > 0 ? title : $localize`Note`,
    bullets: firstLine != null ? [{ text: firstLine }] : [],
  };
}

function describeTerrain(
  feature: BniTerrainFeature,
  cell: { x: number; y: number },
): Omit<HoverCard, "selected"> {
  const active = activeTileOf(feature);
  return {
    header: terrainDisplayName(feature),
    bullets:
      active.x === cell.x && active.y === cell.y
        ? [{ text: $localize`Erupts here` }]
        : [],
  };
}

// The header carries the first construction material, as the game's
// BUILDING_HOVER_NAME_FMT does; a building with more material slots lists the
// rest on one line, since the game's card never shows them at all.
function describeBuilding(item: BlueprintItem): Omit<HoverCard, "selected"> {
  const bullets: HoverCardBullet[] = [];
  const otherMaterials = item.buildableElements
    .slice(1)
    .filter((element) => element != null)
    .map((element) => element.name);
  if (otherMaterials.length > 0)
    bullets.push({
      text: $localize`Also: `,
      accent: otherMaterials.join(", "),
    });
  if (item.tempDisabled) bullets.push({ text: $localize`Disabled` });
  const setting = headlineSetting(item);
  if (setting != null) bullets.push(setting);
  return {
    header: item.oniItem.name,
    material: item.buildableElements[0]?.name,
    bullets: bullets.slice(0, MAX_BULLETS),
  };
}

// The one setting worth a line on the card: the building's canonical
// settings Key when it has one (a sensor's threshold, a filter's element),
// otherwise the first stored setting the catalogue can format, priority
// aside.
export function headlineSetting(item: BlueprintItem): HoverCardBullet | null {
  const entries = (item.buildingData ?? []).filter(
    (entry) => entry.Key != PRIORITY_KEY,
  );
  const primary = primarySettingsKey(item.id);
  const ordered =
    primary == null
      ? entries
      : [
          ...entries.filter((entry) => entry.Key == primary.key),
          ...entries.filter((entry) => entry.Key != primary.key),
        ];

  for (const entry of ordered) {
    let rows;
    try {
      rows = formatBuildingDataEntry(entry, item.id);
    } catch {
      // A shape the catalogue does not know (a newer game, a mod): try the
      // next entry rather than lose the card.
      continue;
    }
    const row = rows?.[0];
    if (row == null) continue;
    return {
      text: `${row.label}: `,
      accent: displayText(item.id, entry.Key, row.field, row.text),
    };
  }
  return null;
}

// formatBuildingDataEntry leaves an element as its raw id ("Oxygen"):
// resolving the display name is the frontend's job.
function displayText(
  prefabId: string,
  key: string,
  field: string,
  text: string,
): string {
  const descriptor = resolveSettingDescriptors(prefabId, key).find(
    (d) => d.field == field,
  );
  if (descriptor?.type != "element") return text;
  return BuildableElement.getElementById(text)?.name ?? text;
}

function describeElement(
  element: BuildableElement | undefined,
  mass: number | undefined,
  temperatureKelvin: number | undefined,
  context: HoverCardContext,
): Omit<HoverCard, "selected"> {
  if (element == null)
    return { header: $localize`Unknown element`, bullets: [] };

  const bullets: HoverCardBullet[] = [
    {
      text:
        context.gameString(STATE_KEYS[element.state]) ??
        STATE_FALLBACKS[element.state],
    },
  ];
  // A vacuum has neither.
  if (element.state != ElementState.Vacuum) {
    // Oxygen and polluted oxygen get the game's breathability after the mass.
    if (mass != null)
      bullets.push(
        BREATHABLE_ELEMENTS.includes(element.id)
          ? {
              text: massPipe.transform(mass),
              accent: ` (${breathability(mass, context)})`,
            }
          : { text: massPipe.transform(mass) },
      );
    if (temperatureKelvin != null)
      bullets.push({ text: formatCelsius(temperatureKelvin) });
  }
  return { header: element.name, bullets };
}

export function formatCelsius(kelvin: number): string {
  const celsius = Math.round((kelvin - 273.15) * 10) / 10;
  return `${celsius} °C`;
}
