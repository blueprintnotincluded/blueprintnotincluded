import { BSpriteInfo } from './b-sprite-info';
import { BSpriteModifier } from './b-sprite-modifier';
import { UtilityConnection } from '../utility-connection';
import { Overlay } from '../enums/overlay';
import { PermittedRotations } from '../enums/permitted-rotations';
import { BUiScreen } from '../b-export/b-ui-screen';
import { Vector2 } from '../vector2';
import { ZIndex } from '../enums/z-index';
import { BuildLocationRule } from '../enums/build-location-rule';
import { AreaOfEffect } from '../area-of-effect';
export declare class BBuilding {
    name: string;
    prefabId: string;
    isTile: boolean;
    isFoundation: boolean;
    isUtility: boolean;
    isBridge: boolean;
    sizeInCells: Vector2;
    sceneLayer: ZIndex;
    viewMode: Overlay;
    backColor: number;
    frontColor: number;
    kanimPrefix: string;
    textureName: string;
    uiImage: string;
    spriteInfos: BSpriteInfo[];
    spriteModifiers: BSpriteModifier[];
    utilities: UtilityConnection[];
    areasOfEffect?: AreaOfEffect[];
    materialCategory: string[];
    materialMass: number[];
    uiScreens: BUiScreen[];
    sprites: BSpriteGroup;
    dragBuild: boolean;
    deprecated: boolean;
    debugOnly: boolean;
    objectLayer: number;
    permittedRotations: PermittedRotations;
    buildLocationRule: BuildLocationRule;
    dlcIds: string[];
    roomTags: string[];
    tileableLeftRight: boolean;
    tileableTopBottom: boolean;
    connectionSprites: boolean;
    connectionScale: Vector2;
    uiImageRect?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    mod?: string;
    modTitle?: string;
    attachableTo?: string;
    attachablePosition?: {
        x: number;
        y: number;
    };
    attachPoints?: BuildingAttachPoint[];
    rocketModule?: RocketModuleInfo;
    settings?: BuildingSettingsInfo;
}
export interface BuildingSettingsInfo {
    prioritizable?: true;
    userNameable?: true;
    door?: {
        doorType: string;
        hasComplexUserControls: boolean;
        allowAutoControl: boolean;
    };
    valve?: {
        conduitType: string;
        maxFlow: number;
    };
    limitValve?: {
        conduitType: string;
        maxLimitKg: number;
        displayUnitsInsteadOfMass: boolean;
    };
    userControlledCapacity?: {
        minCapacity: number;
        maxCapacity: number;
        wholeValues: boolean;
        units: string;
        source: string;
    };
}
export interface BuildingAttachPoint {
    offset: {
        x: number;
        y: number;
    };
    tag: string;
}
export declare const ROCKET_ATTACH_TAG = "Rocket";
export interface RocketModuleInfo {
    burden: number;
    enginePower: number;
    fuelKilogramPerDistance: number;
    buildConditions: string[];
    engineMaxHeight?: number;
}
export declare class BSpriteGroup {
    groupName: string;
    spriteNames: string[];
    constructor(groupName: string);
    static clone(original: BSpriteGroup): BSpriteGroup;
}
//# sourceMappingURL=b-building.d.ts.map