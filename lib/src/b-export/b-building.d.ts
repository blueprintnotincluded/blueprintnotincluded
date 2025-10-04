import { BSpriteInfo } from './b-sprite-info';
import { BSpriteModifier } from './b-sprite-modifier';
import { UtilityConnection } from '../utility-connection';
import { Overlay } from '../enums/overlay';
import { PermittedRotations } from '../enums/permitted-rotations';
import { BUiScreen } from '../b-export/b-ui-screen';
import { Vector2 } from '../vector2';
import { ZIndex } from '../enums/z-index';
import { BuildLocationRule } from '../enums/build-location-rule';
export declare class BBuilding {
    name: string;
    prefabId: string;
    isTile: boolean;
    isUtility: boolean;
    isBridge: boolean;
    sizeInCells: Vector2;
    sceneLayer: ZIndex;
    viewMode: Overlay;
    backColor: number;
    frontColor: number;
    kanimPrefix: string;
    textureName: string;
    spriteInfos: BSpriteInfo[];
    spriteModifiers: BSpriteModifier[];
    utilities: UtilityConnection[];
    materialCategory: string[];
    materialMass: number[];
    uiScreens: BUiScreen[];
    sprites: BSpriteGroup;
    dragBuild: boolean;
    objectLayer: number;
    permittedRotations: PermittedRotations;
    buildLocationRule: BuildLocationRule;
    tileableLeftRight: boolean;
    tileableTopBottom: boolean;
}
export declare class BSpriteGroup {
    groupName: string;
    spriteNames: string[];
    constructor(groupName: string);
    static clone(original: BSpriteGroup): BSpriteGroup;
}
//# sourceMappingURL=b-building.d.ts.map