import { deriveBlueprintMods, OniItem } from '../../../lib/index';

// Server-side mod derivation: the client never supplies `mods` — this is the
// only writer (same policy as `rooms`). Requires the game database to be
// loaded (OniItem.load in app.ts startup). Returns the sorted distinct
// workshop-id list; [] means "no known-mod buildings" (an unparseable data
// blob also yields [] — a save with unparseable data has bigger problems and
// must not fail on derivation).
let modByPrefabId: Map<string, string> | null = null;

function getModByPrefabId(): Map<string, string> {
  if (modByPrefabId == null) {
    modByPrefabId = new Map();
    for (const item of OniItem.oniItems) if (item.mod != null) modByPrefabId.set(item.id, item.mod);
  }
  return modByPrefabId;
}

export function deriveMods(data: unknown): string[] {
  try {
    const items = (data as { blueprintItems?: { id?: unknown }[] })?.blueprintItems ?? [];
    const prefabIds = items.map(b => String(b.id));
    return deriveBlueprintMods(prefabIds, getModByPrefabId());
  } catch {
    return [];
  }
}
