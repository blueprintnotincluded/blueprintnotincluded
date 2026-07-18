import { ForkedFromDto } from './blueprint-version';
export interface BlueprintListResponse {
    blueprints: BlueprintListItem[];
    oldest: Date;
    remaining: number;
}
export interface BlueprintListItem {
    id: string;
    name: string;
    ownerId: string;
    ownerName: string;
    createdAt: Date;
    modifiedAt: Date;
    thumbnail: string;
    nbRatings: number;
    rating: number;
    commentCount: number;
    gameVersion?: string | null;
    category?: string | null;
    subcategory?: string | null;
    description?: string | null;
    modded?: boolean | null;
    rooms?: string[] | null;
    isPublished: boolean;
    nbForks: number;
    nbViews: number;
    nbDownloads: number;
    forkedFrom?: ForkedFromDto | null;
}
export interface BlueprintDetailsResponse extends BlueprintListItem {
    researchTier?: string | null;
    myRating: number | null;
    ownedByMe: boolean;
}
export interface RelatedBlueprintsResponse {
    blueprints: BlueprintListItem[];
}
export interface BlueprintRate {
    blueprintId: string;
    rating: number;
}
export interface BlueprintRateResponse {
    nbRatings: number;
    rating: number;
    myRating: number;
}
export interface BlueprintDelete {
    blueprintId: string;
}
export interface BlueprintResponse {
    id: string;
    name: string;
    data: any;
    nbRatings: number;
    rating: number;
    myRating: number | null;
    gameVersion?: string | null;
    category?: string | null;
    subcategory?: string | null;
    description?: string | null;
    researchTier?: string | null;
    modded?: boolean | null;
    rooms?: string[] | null;
    isPublished: boolean;
}
//# sourceMappingURL=blueprint-list-response.d.ts.map