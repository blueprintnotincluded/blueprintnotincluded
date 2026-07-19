import { ForkedFromDto } from './blueprint-version';
import { RawSourceFormat } from '../io/bni/bni-share-string';

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
  // List responses send a sentinel, never image data: 'real' = fetch the
  // stored thumbnail via GET /api/blueprints/:id/thumbnail (used only as the
  // preview's error fallback); 'svg'/'svg_nothing' render placeholder
  // branches. (BlueprintDetailsResponse still inlines the data URI here.)
  thumbnail: string;
  // Star-rating aggregate (denormalized onto the blueprint; recomputed
  // out of band so the algorithm can evolve — plain average for now)
  nbRatings: number;
  rating: number; // average 1–5; 0 = unrated
  commentCount: number;
  gameVersion?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  modded?: boolean | null;
  // Server-derived room types contained in the blueprint (see RoomTypeId);
  // null = never derived or too large for detection
  rooms?: string[] | null;
  isPublished: boolean;
  nbForks: number;
  // Approximate by design: served from throttled write-behind counters
  nbViews: number;
  nbDownloads: number;
  // Present when this blueprint is a fork; null blueprintName means the
  // parent has been soft-deleted ("[original removed by author]")
  forkedFrom?: ForkedFromDto | null;
}

// Meta-only view for the blueprint details page — everything the list item
// carries, without the heavy `data` payload the editor loads separately.
// Per-viewer fields (myRating/ownedByMe) live only here: list responses are
// identical for every viewer so the CDN can serve them from the edge; the
// details page is the one surface that personalizes.
export interface BlueprintDetailsResponse extends BlueprintListItem {
  researchTier?: string | null;
  myRating: number | null;
  ownedByMe: boolean;
}

// "You might also like" shelf on the details page
export interface RelatedBlueprintsResponse {
  blueprints: BlueprintListItem[];
}

export interface BlueprintRate {
  blueprintId: string;
  rating: number; // integer 1–5
}

// Returned by the rate endpoint so the client can show the fresh aggregate
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
  // True when the server holds the verbatim BlueprintsV2 upload — downloads
  // should fetch GET /api/blueprints/:id/raw instead of regenerating the
  // file from the parsed data.
  hasRawSource?: boolean;
  rawSourceFormat?: RawSourceFormat | null;
}
