import { ForkedFromDto } from './blueprint-version';
import { RawSourceFormat } from '../io/bni/bni-share-string';

export interface BlueprintListResponse {
  blueprints: BlueprintListItem[];
  oldest: Date;
  remaining: number;
}

// Title fields shared by every response that shows a blueprint's name
// (spec/search-followups.md §2.5). `name` is ALWAYS the authored title and
// never changes meaning — it is what the {owner, name} duplicate check, the
// download filename and the editor's save path all read. The viewer-resolved
// title is a separate field so a display surface that hasn't been updated
// degrades to the author's own words rather than silently translating a
// filename.
export interface TranslatedTitleFields {
  // What to render. Absent = show `name` (server built the response without
  // resolution, or resolution failed — always safe).
  displayName?: string;
  // True when `displayName` is machine output rather than the author's words.
  // The UI must disclose this and keep `name` reachable (§2.7): presenting a
  // machine title as the author's own is the one thing this feature must not
  // do.
  nameTranslated?: boolean;
  // Language the author wrote the title in, when known — "Translated from
  // Portuguese". null = detection was never confident.
  nameSourceLang?: string | null;
}

export interface BlueprintListItem extends TranslatedTitleFields {
  id: string;
  // The authored title, verbatim. See TranslatedTitleFields.
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
  // Raw Klei DLC ids the blueprint's buildings require (see DLC_LABELS for
  // display names); [] = base game only, absent = never derived.
  requiredDlcs?: string[];
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  modded?: boolean | null;
  // Workshop ids of the mods this blueprint's buildings come from
  // (see Blueprint.mods); absent = never derived, [] = derived, no known mods.
  mods?: string[];
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
  // Search results only: how many identical copies of this build also
  // matched and were collapsed behind this card
  // (spec/multilingual-search-plan.md §2.5). 0/absent everywhere else, and
  // whenever collapse is switched off. Nothing is deleted or hidden — the
  // copies keep their URLs and their owners' profile listings.
  duplicateCount?: number;
}

// Self-excluding ("drill-down") facet counts for the Discover sidebar —
// GET /api/blueprintfacets(Secure), same query params as getblueprints.
// Each group's counts apply every OTHER active filter but not its own
// (picking a DLC must not zero out the rest of the DLC list); requiredDlcs
// and baseGame share one count map with the excludeDlc= "hide" group, since
// show-only/hide are two controls over a single dimension. Array-valued
// dimensions (rooms, requiredDlcs) don't sum to `total`: a blueprint needing
// two packs counts once under each. Omitting a key from a map means 0.
export interface BlueprintFacetsResponse {
  total: number;
  category: Record<string, number>;
  subcategory: Record<string, number>;
  rooms: Record<string, number>;
  requiredDlcs: Record<string, number>;
  baseGame: number;
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
  // ISO-639-1 language of `description`, server-derived on save; null =
  // detection ran and was not confident, absent = never derived (legacy docs).
  // Drives the "Translate" affordance — only shown when set, non-null, and
  // different from the viewer's locale.
  sourceLang?: string | null;
  // Whether the server has a translation provider configured. The client must
  // gate every "Translate" affordance on this — with no API key in prod the
  // endpoints 503, and a button that renders only to fail is worse than none.
  translationEnabled?: boolean;
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

// Editor-open payload. `name` here is load-bearing beyond display: the editor
// stores it and the save dialog pre-fills from it, so an overwrite save writes
// it straight back to Blueprint.name. It therefore stays authored, always, and
// the resolved title rides along in displayName for chrome that wants it.
export interface BlueprintResponse extends TranslatedTitleFields {
  id: string;
  name: string;
  data: any;
  nbRatings: number;
  rating: number;
  myRating: number | null;
  requiredDlcs?: string[];
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  researchTier?: string | null;
  modded?: boolean | null;
  mods?: string[];
  rooms?: string[] | null;
  isPublished: boolean;
  // True when the server holds the verbatim BlueprintsV2 upload — downloads
  // should fetch GET /api/blueprints/:id/raw instead of regenerating the
  // file from the parsed data.
  hasRawSource?: boolean;
  rawSourceFormat?: RawSourceFormat | null;
}
