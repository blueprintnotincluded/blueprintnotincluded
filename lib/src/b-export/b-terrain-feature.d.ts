export interface BTerrainFeature {
    id: string;
    name: string;
    width: number;
    height: number;
    dlcIds: string[];
    activeTile?: {
        x: number;
        y: number;
    };
}
export declare class TerrainFeature implements BTerrainFeature {
    id: string;
    name: string;
    width: number;
    height: number;
    dlcIds: string[];
    activeTile: {
        x: number;
        y: number;
    };
    iconUrl: string;
    importFrom(original: BTerrainFeature): void;
    static features: TerrainFeature[];
    private static featuresMap;
    static init(): void;
    static load(originals: BTerrainFeature[] | null | undefined): void;
    static getFeature(id: string): TerrainFeature | undefined;
}
//# sourceMappingURL=b-terrain-feature.d.ts.map