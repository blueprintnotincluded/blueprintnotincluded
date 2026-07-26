import { Category } from './blueprint-metadata';
import { DlcId } from './dlc';
export declare function deriveRequiredDlcs(buildingDlcIds: DlcId[][]): DlcId[];
export declare function deriveBlueprintMods(prefabIds: string[], modByPrefabId: Map<string, string>): string[];
export declare function deriveModded(prefabIds: string[], knownIds: Set<string>, modByPrefabId: Map<string, string>): boolean;
export interface HotScoreInputs {
    ratingCount: number;
    ratingAverage: number;
    downloadCount: number;
    createdAt: Date;
}
export declare const HOT_SCORE: {
    readonly PRIOR_MEAN: 3.5;
    readonly SHRINK_VOTES: 3;
    readonly W_RATING: 1;
    readonly W_DOWNLOAD: 0.5;
    readonly W_RECENCY: 0.18;
    readonly MS_PER_DAY: 86400000;
};
export declare function bayesianRating(ratingCount: number, ratingAverage: number): number;
export declare function computeHotScore(i: HotScoreInputs): number;
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