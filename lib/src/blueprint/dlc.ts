// Klei's raw DLC ids, exactly as the game exports them
// (kPrefabID.requiredDlcIds -> BBuildingDef2024.dlcIds). Blueprints store these
// verbatim: the id IS the identity, so a wrong display name can never turn into
// wrong data, and a rename never costs a data rewrite.
export type DlcId = string;

// Display names, taken from the game's own strings (STRINGS.UI.<id>.NAME in the
// export's po_string.json) rather than invented here — that's what makes them
// checkable instead of guesswork.
//
// Deliberately plain strings, not $localize: lib is shared with the backend,
// where the Angular $localize global doesn't exist at runtime. Translating pack
// names is a frontend concern and belongs at the display site.
export const DLC_LABELS: Record<DlcId, string> = {
  EXPANSION1_ID: 'Spaced Out!',
  DLC2_ID: 'The Frosty Planet Pack',
  DLC3_ID: 'The Bionic Booster Pack',
  DLC4_ID: 'The Prehistoric Planet Pack',
  DLC5_ID: 'The Aquatic Planet Pack',
};

// Unknown ids fall back to the raw id, so a DLC released after this map was
// written degrades to ugly-but-correct instead of silently vanishing from the
// UI (or from a filter built on these labels).
export function dlcLabel(id: DlcId): string {
  return DLC_LABELS[id] ?? id;
}
