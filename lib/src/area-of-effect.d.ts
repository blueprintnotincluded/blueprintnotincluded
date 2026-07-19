import { Orientation } from './enums/orientation';
import { Vector2 } from './vector2';
export interface AreaOfEffect {
    kind: 'light' | 'elementIntake' | 'operationRange' | 'radiation' | 'skyScan' | string;
    source: string;
    shape: 'circle' | 'cone' | 'quad' | 'diamond' | 'rect' | 'ellipse' | 'ellipseArc' | 'skyColumns' | string;
    origin: {
        x: number;
        y: number;
    };
    blockedBySolids: boolean;
    cells?: [number, number][];
    range?: number;
    lux?: number;
    falloffRate?: number;
    lightColor?: {
        r: number;
        g: number;
        b: number;
        a: number;
    };
    width?: number;
    direction?: 'North' | 'East' | 'South' | 'West';
    radius?: number;
    element?: string;
    consumptionRate?: number;
    rectMin?: {
        x: number;
        y: number;
    };
    rectMax?: {
        x: number;
        y: number;
    };
    radiusX?: number;
    radiusY?: number;
    rads?: number;
    arcAngle?: number;
    arcDirection?: number;
    emitType?: string;
    radiusScalesWithRads?: boolean;
    scanMinX?: number;
    scanMaxX?: number;
    verticalStep?: number;
}
export declare const AREA_OF_EFFECT_GENERATED_CELL_LIMIT = 4096;
export declare const SKY_SCAN_PREVIEW_HEIGHT = 25;
export declare function dedupeAreasOfEffect(effects: AreaOfEffect[] | null | undefined): AreaOfEffect[];
/** Resolve an effect to pre-orientation offsets from the building origin cell. */
export declare function resolveAreaOfEffectCells(effect: AreaOfEffect): Vector2[];
/** Apply the same rotate-then-flip convention used by building utility ports. */
export declare function orientAreaOfEffectCell(cell: Vector2, orientation: Orientation): Vector2;
//# sourceMappingURL=area-of-effect.d.ts.map