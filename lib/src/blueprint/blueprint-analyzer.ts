import { GAME_VERSIONS, GameVersion } from './blueprint-metadata';

// Raw DLC ID strings as exported by OniExtract2024.
type DlcId = string;

const DLC_TO_GAME_VERSION: Record<string, GameVersion> = {
  EXPANSION1_ID: 'spacedOut',
  DLC2_ID: 'frostyPlanet',
  DLC5_ID: 'bionicBooster',
};

// Returns the minimum game version required to use a blueprint, based on which
// DLC IDs each building requires. Priority follows the GAME_VERSIONS order
// (highest index wins). Unknown DLC IDs are ignored.
export function deriveGameVersion(buildingDlcIds: DlcId[][]): GameVersion {
  let best = 0; // index into GAME_VERSIONS
  for (const dlcIds of buildingDlcIds) {
    for (const dlcId of dlcIds) {
      const version = DLC_TO_GAME_VERSION[dlcId];
      if (version === undefined) continue;
      const idx = GAME_VERSIONS.indexOf(version);
      if (idx > best) best = idx;
    }
  }
  return GAME_VERSIONS[best];
}

// Returns true when any building ID in the blueprint is not in the known set.
// The known set is built from the loaded database (OniItem.oniItemsMap or the
// database JSON). Blueprints with unknown IDs were created with mods.
export function deriveModded(prefabIds: string[], knownIds: Set<string>): boolean {
  return prefabIds.some(id => !knownIds.has(id));
}
