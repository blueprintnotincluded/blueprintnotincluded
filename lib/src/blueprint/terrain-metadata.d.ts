export declare const BNI_METADATA_NAMESPACE = "bni";
export declare const TERRAIN_METADATA_KEY: string;
export declare const TERRAIN_SCHEMA_VERSION = 1;
export interface BniTerrainFeature {
    id: string;
    x: number;
    y: number;
    [unknownKey: string]: unknown;
}
export declare function decodeTerrainFeatures(metadata: Record<string, string> | null | undefined): BniTerrainFeature[];
export declare function encodeTerrainFeatures(metadata: Record<string, string> | null | undefined, features: BniTerrainFeature[]): Record<string, string> | undefined;
//# sourceMappingURL=terrain-metadata.d.ts.map