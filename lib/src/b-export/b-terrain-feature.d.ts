export type TerrainFeatureKind = 'terrain' | 'plant';
export interface BTerrainFeature {
    id: string;
    name: string;
    width: number;
    height: number;
    dlcIds: string[];
    kind?: TerrainFeatureKind;
    activeTile?: {
        x: number;
        y: number;
    };
    uiImageRect?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
export declare class TerrainFeature implements BTerrainFeature {
    id: string;
    name: string;
    width: number;
    height: number;
    dlcIds: string[];
    kind: TerrainFeatureKind;
    activeTile: {
        x: number;
        y: number;
    };
    uiImageRect?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    iconUrl: string;
    thumbUrl: string;
    importFrom(original: BTerrainFeature): void;
    get isPlant(): boolean;
    static features: TerrainFeature[];
    private static featuresMap;
    static byKind(kind: TerrainFeatureKind): TerrainFeature[];
    static init(): void;
    static load(originals: BTerrainFeature[] | null | undefined): void;
    static getFeature(id: string): TerrainFeature | undefined;
}
//# sourceMappingURL=b-terrain-feature.d.ts.map