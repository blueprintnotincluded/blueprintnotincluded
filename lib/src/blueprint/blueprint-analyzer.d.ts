import { GameVersion } from './blueprint-metadata';
type DlcId = string;
export declare function deriveGameVersion(buildingDlcIds: DlcId[][]): GameVersion;
export declare function deriveModded(prefabIds: string[], knownIds: Set<string>): boolean;
export {};
//# sourceMappingURL=blueprint-analyzer.d.ts.map