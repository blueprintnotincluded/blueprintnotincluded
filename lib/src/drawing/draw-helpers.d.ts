import { Overlay } from '../enums/overlay';
import { Vector2 } from '../vector2';
import { BSpriteInfo } from '../b-export/b-sprite-info';
import { SpriteTag } from '../enums/sprite-tag';
export declare class DrawHelpers {
    static whiteColor: number;
    static createUrl(ressource: string, ui: boolean): string;
    static getOverlayUrl(overlay: Overlay): string;
    static rotateVector2(v: Vector2, center: Vector2, rotation: number): Vector2;
    static scaleVector2(v: Vector2, center: Vector2, scale: Vector2): Vector2;
    static getRandomColor(): string;
    static hexToRgb(hex: string): number[];
    static colorToHex(color: number): string;
    private static toHex;
    static blendColor(a: number, b: number, ratio: number): number;
    static connectionBits: number[];
    static connectionBitsOpposite: number[];
    static connectionVectors: Vector2[];
    static getConnectionArray(connections: number): boolean[];
    static getConnection(connectionArray: boolean[]): number;
    static getIntegerTile(floatTile: Vector2): Vector2;
    static getFloorTile(floatTile: Vector2): Vector2;
    static generateTileSpriteInfo(kanimPrefix: string, textureName: string): BSpriteInfo[];
    static getTileIndex(position: Vector2): number;
    static getTilePosition(index: number): Vector2;
    private static scaleSteps;
    static temperatureThresholds: TemperatureThreshold[];
    static temperatureToColor(temperature: number): number;
    static temperatureToScale(temperature: number): number;
    static scaleToTemperature(scale: number): number;
    static connectionString: string[];
    static connectionTag: SpriteTag[];
    static connectionStringSolid: string[];
    static overlayString: string[];
}
export interface TemperatureThreshold {
    temperature: number;
    color: number;
    label: string;
    /** used as STRINGS.UI.OVERLAYS.${code}.NAME */
    code: string;
}
//# sourceMappingURL=draw-helpers.d.ts.map