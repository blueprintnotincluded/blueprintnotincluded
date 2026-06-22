export interface BExport2024Meta {
    buildVersion: number;
    dlcs: string[];
    ExportFileName: string;
    DatabaseDirName: string;
}
export interface BTag2024 {
    Name: string;
    IsValid: boolean;
}
export interface BKPrefabID2024 {
    name: string;
    nameString: string;
    SaveLoadTag: BTag2024;
    PrefabTag: BTag2024;
    defaultLayer: number;
    tags: BTag2024[] | string | null;
    requiredDlcIds: string[] | string | null;
    forbiddenDlcIds: string[] | string | null;
}
export interface BBuildingDef2024 {
    name: string;
    nameString: string;
    kPrefabID: BKPrefabID2024;
    tags: BTag2024[] | null;
    widthInCells: number;
    heightInCells: number;
    materialCategory: string[] | null;
    materialMass: number[] | null;
    isFoundation: boolean;
    isKAnimTile: boolean;
    isUtility: boolean;
    dragBuild: boolean;
    buildLocationRule: number;
    permittedRotations: number;
    sceneLayer: number;
    objectLayer: number;
    viewMode: string;
    defaultAnimState: string;
    uiSpriteName: string | null;
    uiImageRect?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    energyGenerator?: unknown;
    conduitConsumer?: unknown;
    conduitDispenser?: unknown;
    plantablePlot?: unknown;
    elementConverters?: unknown[];
    elementConsumers?: unknown[];
    passiveElementConsumers?: unknown[];
    storage?: unknown;
    battery?: unknown;
}
export interface BBuildingSubcategoryPair2024 {
    Key: string;
    Value: string;
}
export interface BBuildMenuCategory2024 {
    category: number;
    categoryName: string;
    categoryIcon: string;
}
export interface BBuildingFile2024 extends BExport2024Meta {
    bBuildingDefList: BBuildingDef2024[];
    buildMenuCategories: BBuildMenuCategory2024[];
    buildingAndSubcategoryDataPairs: {
        [categoryName: string]: BBuildingSubcategoryPair2024[];
    };
    roomConstraintTags?: unknown;
    requiredSkillPerkMap?: unknown;
}
export interface BElement2024 {
    name: string;
    id: string;
    tag: number;
    oreTags: string[] | null;
    state: string;
    buildMenuSort: number;
    materialCategory: string;
    color: number;
    conduitColor: number;
    uiColor: number;
}
export interface BElementsFile2024 extends BExport2024Meta {
    elementTable: {
        [decimalSimHash: string]: BElement2024;
    };
}
export interface BColor2024 {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface BUiSpriteInfo2024 {
    id: string;
    name: string;
    spriteName: string;
    textureName: string;
    color: BColor2024;
}
export interface BUiSpriteInfoFile2024 extends BExport2024Meta {
    uiSpriteInfos: {
        [prefabTag: string]: BUiSpriteInfo2024;
    };
}
//# sourceMappingURL=b-export-2024.d.ts.map