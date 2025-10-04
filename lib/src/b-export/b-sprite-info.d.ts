import { Vector2 } from '../vector2';
export declare class BSpriteInfo {
    name: string;
    textureName: string;
    isIcon: boolean;
    isInputOutput: boolean;
    uvMin: Vector2;
    uvSize: Vector2;
    realSize: Vector2;
    pivot: Vector2;
    static clone(source: BSpriteInfo): BSpriteInfo;
}
//# sourceMappingURL=b-sprite-info.d.ts.map