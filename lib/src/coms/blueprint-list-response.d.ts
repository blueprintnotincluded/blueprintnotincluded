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
    tags: string[];
    createdAt: Date;
    modifiedAt: Date;
    thumbnail: string;
    nbLikes: number;
    likedByMe: boolean;
    ownedByMe: boolean;
    gameVersion?: string | null;
    category?: string | null;
    subcategory?: string | null;
    description?: string | null;
    modded?: boolean | null;
}
export interface BlueprintLike {
    blueprintId: string;
    like: boolean;
}
export interface BlueprintDelete {
    blueprintId: string;
}
export interface BlueprintResponse {
    id: string;
    name: string;
    data: any;
    likedByMe: boolean;
    nbLikes: number;
    gameVersion?: string | null;
    category?: string | null;
    subcategory?: string | null;
    description?: string | null;
    researchTier?: string | null;
    modded?: boolean | null;
}
//# sourceMappingURL=blueprint-list-response.d.ts.map