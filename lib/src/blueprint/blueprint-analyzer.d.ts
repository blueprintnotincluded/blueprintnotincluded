import { Category, GameVersion } from './blueprint-metadata';
type DlcId = string;
export declare function deriveGameVersion(buildingDlcIds: DlcId[][]): GameVersion;
export declare function deriveModded(prefabIds: string[], knownIds: Set<string>): boolean;
export interface CategoryLookup {
    gameCategoryByPrefabId: Map<string, string>;
}
interface BuildMenuCategoryLike {
    category: number;
    categoryName: string;
}
interface BuildMenuItemLike {
    category: number;
    buildingId: string;
}
export declare function buildCategoryLookup(buildMenuCategories: BuildMenuCategoryLike[], buildMenuItems: BuildMenuItemLike[]): CategoryLookup;
interface SignatureVote {
    category: Category;
    weight: number;
}
export declare const SIGNATURE_PREFABS: Record<string, SignatureVote[]>;
export declare function deriveCategory(prefabIds: string[], lookup: CategoryLookup): Category | null;
export {};
//# sourceMappingURL=blueprint-analyzer.d.ts.map