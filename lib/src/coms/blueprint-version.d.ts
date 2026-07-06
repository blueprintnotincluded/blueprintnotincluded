export interface BlueprintVersionDto {
    id: string;
    name: string | null;
    createdAt: string;
    thumbnail: string | null;
}
export interface ListBlueprintVersionsResponse {
    versions: BlueprintVersionDto[];
}
export interface CreateBlueprintVersionRequest {
    name?: string | null;
}
export interface CreateBlueprintVersionResponse {
    version: BlueprintVersionDto;
}
export interface ForkBlueprintResponse {
    id: string;
}
export interface ForkedFromDto {
    blueprintId: string;
    blueprintName: string | null;
}
//# sourceMappingURL=blueprint-version.d.ts.map