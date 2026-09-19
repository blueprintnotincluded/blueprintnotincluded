import { BlueprintItem } from './blueprint-item';
import { BuildableElement } from '../b-export/b-element';

// "Replace every X with Y" on a selection: a material swap only (no building
// swap), decided slot by slot. A slot is rewritten when it currently holds X
// and the building's own material list for that slot admits Y; every other
// slot is left alone. Building settings (buildingData) are never touched:
// they describe the building's configuration, not what it is made of.
//
// Element annotations (OniItem.isElement, painted terrain cells) are not
// built of anything, so they neither appear in the selection's element list
// nor take part in a replacement.

// One building the replacement will change, with the material slots it
// rewrites. `blocked` lists the X slots Y cannot go into (a slot's material
// category rejects Y) - the building is still changed, just not fully.
export interface ElementReplacement {
  item: BlueprintItem;
  slots: number[];
  blocked: number[];
}

export interface ReplaceElementPlan {
  from: BuildableElement;
  to: BuildableElement;
  // Buildings that hold X in at least one slot Y can go into.
  changes: ElementReplacement[];
  // Buildings that hold X but cannot be made of Y in any of those slots
  // (a Plastic-only building when Y is Copper). Never rewritten.
  skipped: BlueprintItem[];
}

// A candidate Y for the "with" picker: an element at least one X slot in the
// selection can take, with how many X buildings would still be skipped.
export interface ReplacementCandidate {
  element: BuildableElement;
  skipped: number;
}

function materialSlots(item: BlueprintItem): BuildableElement[][] {
  if (item.oniItem == null || item.oniItem.isElement) return [];
  return item.oniItem.buildableElementsArray ?? [];
}

// Distinct elements the selection's buildings are made of, in order of first
// appearance (the "Replace" picker).
export function elementsInSelection(items: BlueprintItem[]): BuildableElement[] {
  const found: BuildableElement[] = [];
  for (const item of items) {
    const slots = materialSlots(item);
    for (let index = 0; index < slots.length; index++) {
      const element = item.buildableElements[index];
      if (element != null && found.indexOf(element) == -1) found.push(element);
    }
  }
  return found;
}

// Buildings holding `from` in at least one material slot.
function itemsHolding(items: BlueprintItem[], from: BuildableElement): BlueprintItem[] {
  return items.filter(item => {
    const slots = materialSlots(item);
    for (let index = 0; index < slots.length; index++)
      if (item.buildableElements[index] == from) return true;
    return false;
  });
}

// Elements the X slots in the selection can be switched to (the "with"
// picker), X itself excluded. Ordered by first appearance in the buildings'
// material lists, which already follow the game's build-menu order.
export function replacementCandidates(
  items: BlueprintItem[],
  from: BuildableElement
): ReplacementCandidate[] {
  const holders = itemsHolding(items, from);
  const candidates: BuildableElement[] = [];
  for (const item of holders) {
    const slots = materialSlots(item);
    for (let index = 0; index < slots.length; index++) {
      if (item.buildableElements[index] != from) continue;
      for (const element of slots[index])
        if (element != from && candidates.indexOf(element) == -1) candidates.push(element);
    }
  }
  return candidates.map(element => ({
    element,
    skipped: planElementReplacement(holders, from, element).skipped.length,
  }));
}

// Works out what replacing `from` with `to` would do, without writing anything.
export function planElementReplacement(
  items: BlueprintItem[],
  from: BuildableElement,
  to: BuildableElement
): ReplaceElementPlan {
  const plan: ReplaceElementPlan = { from, to, changes: [], skipped: [] };
  if (from == to) return plan;

  for (const item of itemsHolding(items, from)) {
    const slots = materialSlots(item);
    const change: ElementReplacement = { item, slots: [], blocked: [] };
    for (let index = 0; index < slots.length; index++) {
      if (item.buildableElements[index] != from) continue;
      if (slots[index].indexOf(to) != -1) change.slots.push(index);
      else change.blocked.push(index);
    }
    if (change.slots.length > 0) plan.changes.push(change);
    else plan.skipped.push(item);
  }
  return plan;
}

// Performs the slot writes of a plan. The caller owns event batching: wrap
// the call in Blueprint.pauseChangeEvents() / resumeChangeEvents(true) so a
// multi-group selection produces one blueprintChanged and one undo step.
export function applyElementReplacement(plan: ReplaceElementPlan): ReplaceElementPlan {
  for (const change of plan.changes)
    for (const index of change.slots) change.item.setElement(plan.to.id, index);
  return plan;
}
