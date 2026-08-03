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

export function excludeDlcTooltip(dlcId: string): string {
  return $localize`:chipTooltip.excludeDlc:Hides blueprints that need the ${dlcLabel(dlcId)} DLC`;
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

// Duplicate-collapse chip (spec/multilingual-search-plan.md §2.5): the count
// is other copies of the SAME build that matched this search, folded into
// one result. Nothing is deleted or hidden — the copies are still browsable,
// and switching collapse off shows every one of them.
export function duplicateTooltip(count: number): string {
  return $localize`:chipTooltip.duplicates:${count} other saved copies of this exact build also match — turn off "Group identical copies" to see them all`;
}
