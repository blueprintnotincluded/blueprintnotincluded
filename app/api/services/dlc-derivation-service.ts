import { deriveRequiredDlcs, OniItem } from '../../../lib/index';

// Server-side DLC-requirement derivation: the client never supplies
// `requiredDlcs` — this is the only writer (same policy as `rooms` and `mods`).
// Requires the game database to be loaded (OniItem.load in app.ts startup).
// Returns the sorted distinct set of raw Klei DLC ids the blueprint's buildings
// need; [] means base game only. Buildings unknown to the database contribute
// nothing (they're the `modded` signal, not a DLC signal), and an unparseable
// data blob also yields [] — such a save has bigger problems and must not fail
// on derivation.
let dlcIdsByPrefabId: Map<string, string[]> | null = null;

function getDlcIdsByPrefabId(): Map<string, string[]> {
  if (dlcIdsByPrefabId == null) {
    dlcIdsByPrefabId = new Map();
    for (const item of OniItem.oniItems)
      if (item.dlcIds != null && item.dlcIds.length > 0) dlcIdsByPrefabId.set(item.id, item.dlcIds);
  }
  return dlcIdsByPrefabId;
}

export function deriveDlcs(data: unknown): string[] {
  try {
    const items = (data as { blueprintItems?: { id?: unknown }[] })?.blueprintItems ?? [];
    const byPrefabId = getDlcIdsByPrefabId();
    const buildingDlcIds = items.map(b => byPrefabId.get(String(b.id)) ?? []);
    return deriveRequiredDlcs(buildingDlcIds);
  } catch {
    return [];
  }
}
