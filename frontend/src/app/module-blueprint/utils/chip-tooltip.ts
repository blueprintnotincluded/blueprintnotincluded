import { dlcLabel } from "../../../../../lib/index";

// Built on dlcLabel() rather than a map of its own: pack names live in lib
// (one place, checked against the game's own strings), and an id we have no
// label for still produces a usable tooltip instead of vanishing.
export function dlcTooltip(dlcId: string): string {
  return $localize`:chipTooltip.dlc:Requires the ${dlcLabel(dlcId)} DLC — browse blueprints that need it`;
}

export function baseGameTooltip(): string {
  return $localize`:chipTooltip.baseGame:Needs no DLC — buildable in the base game`;
}

const GAME_VERSION_TOOLTIPS: Record<string, string> = {
  base: $localize`:chipTooltip.base:Base game — no DLC required`,
  spacedOut: $localize`:chipTooltip.spacedOut:Spaced Out — requires the Spaced Out! DLC`,
  frostyPlanet: $localize`:chipTooltip.frostyPlanet:Frosty Planet — requires the Frosty Planet DLC`,
  bionicBooster: $localize`:chipTooltip.bionicBooster:Bionic Booster — requires the Bionic Booster DLC`,
};

export function gameVersionTooltip(gameVersion: string): string {
  return GAME_VERSION_TOOLTIPS[gameVersion] ?? gameVersion;
}

export function categoryTooltip(category: string): string {
  return $localize`Browse ${category} blueprints`;
}

export function subcategoryTooltip(subcategory: string): string {
  return $localize`Browse ${subcategory} blueprints`;
}

export function roomTooltip(roomLabel: string): string {
  return $localize`:chipTooltip.room:Browse blueprints containing a ${roomLabel}`;
}

export function moddedTooltip(): string {
  return $localize`:chipTooltip.modded:Uses mods not included in the base game`;
}

export function modChipTooltip(title: string): string {
  return $localize`:chipTooltip.mod:Requires the "${title}" mod — opens its Steam Workshop page`;
}
