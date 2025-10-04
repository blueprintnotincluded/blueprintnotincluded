import { Vector2 } from '../vector2';
import { SpriteTag } from '../enums/sprite-tag';
export declare class BSpriteModifier {
    name: string;
    spriteInfoName: string;
    translation: Vector2;
    scale: Vector2;
    rotation: number;
    tags: SpriteTag[];
    static clone(original: BSpriteModifier): BSpriteModifier;
}
//# sourceMappingURL=b-sprite-modifier.d.ts.map