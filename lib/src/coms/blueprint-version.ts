// Fork + version-history API shapes (spec/FORKS.md). Version list/detail payloads are
// metadata-only — the heavy `data` blob is never sent except through the existing
// getblueprint/getblueprintmod editor-load endpoints.

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

// Provenance shown on the details page / card. `null` blueprintName means the
// parent blueprint has been soft-deleted — render "[original removed by author]".
export interface ForkedFromDto {
  blueprintId: string;
  blueprintName: string | null;
}
