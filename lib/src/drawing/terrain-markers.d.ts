import { BniTerrainFeature } from '../blueprint/terrain-metadata';
export declare const FEATURE_ALPHA = 0.65;
export declare const OUTLINE_COLOR = 8246268;
export declare const OUTLINE_ALPHA = 0.9;
export declare const FILL_ALPHA = 0.12;
export declare const FALLBACK_ICON_INSET = 0.86;
export declare function terrainIconUrl(feature: BniTerrainFeature): string;
export declare function terrainDisplayName(feature: BniTerrainFeature): string;
export interface TerrainIconRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface TerrainIconPlacement {
    x: number;
    y: number;
    width: number;
    height: number;
}
export declare function terrainIconPlacement(left: number, top: number, width: number, height: number, rect: TerrainIconRect | undefined, zoom: number, inset?: number): TerrainIconPlacement;
export declare function activeTileOf(feature: BniTerrainFeature): {
    x: number;
    y: number;
};
export declare function drawDashedRect(target: any, left: number, top: number, width: number, height: number, zoom: number, color: number, thickness: number, alpha?: number): void;
export declare function drawTerrainFootprint(graphics: any, left: number, top: number, width: number, height: number, zoom: number, color?: number, thickness?: number, alpha?: number): void;
export declare function positionTerrainSprite(sprite: any, left: number, top: number, width: number, height: number, rect: TerrainIconRect | undefined, zoom: number, inset?: number): TerrainIconPlacement;
export declare function drawTerrainFeature(graphics: any, sprite: any, left: number, top: number, width: number, height: number, zoom: number, rect: TerrainIconRect | undefined): void;
//# sourceMappingURL=terrain-markers.d.ts.map