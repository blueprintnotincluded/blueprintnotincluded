import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChild,
} from "@angular/core";
import {
  BlueprintListItem,
  BlueprintListResponse,
  CATEGORIES,
  SUBCATEGORIES,
  ROOM_TYPE_IDS,
  DLC_LABELS,
  dlcLabel,
} from "../../../../../../lib/index";
import { ROOM_TYPE_LABELS, roomTypeLabel } from "../../utils/room-labels";
import {
  BlueprintService,
  BlueprintSort,
} from "src/app/module-blueprint/services/blueprint-service";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { UserService } from "src/app/module-blueprint/services/user-service";
import { ActivatedRoute, ParamMap, Router } from "@angular/router";
import { Subject, Subscription } from "rxjs";
import { debounceTime } from "rxjs/operators";
import { DialogAboutComponent } from "../dialogs/dialog-about/dialog-about.component";
import { FeedbackDialogComponent } from "../dialogs/feedback-dialog/feedback-dialog.component";

const LOADING_STR = $localize`Loading...`;
const NO_RESULTS_STR = $localize`:browse.noResults:No Results`;
// Shown instead of NO_RESULTS_STR when the empty page is filter-driven,
// distinct from "no blueprints have ever been uploaded" (see activeFilterChips
// bar below — the sidebar can be scrolled out of view, so this and the chip
// bar are the only clue a filter combination is too narrow).
const NO_RESULTS_FILTERED_STR = $localize`:browse.noResultsFiltered:No blueprints match these filters`;

interface ActiveFilterChip {
  key: string;
  label: string;
  ariaLabel: string;
  remove: () => void;
}

/** Grid fade-out duration when the list context changes (ms); must match the
 * .blueprint-grid transition in the component CSS. */
const LIST_FADE_OUT_MS = 160;
/** Once loading placeholders are visible, keep them at least this long so a
 * fast response can't flash them for a single frame. */
const MIN_PLACEHOLDER_MS = 300;

/** Default Discover sort — "new but also good". Omitted from the URL (a bare
 * /discover shows trending) and used as the fallback when the sort param is
 * absent or invalid. */
const DEFAULT_SORT: BlueprintSort = "trending";

@Component({
  selector: "app-browse-page",
  templateUrl: "./browse-page.component.html",
  styleUrls: ["./browse-page.component.css"],
  standalone: false,
})
export class BrowsePageComponent implements OnInit, OnDestroy {
  @ViewChild("aboutDialog") aboutDialog!: DialogAboutComponent;
  @ViewChild("feedbackDialog") feedbackDialog!: FeedbackDialogComponent;

  blueprintListItems: BlueprintListItem[] = [];
  working = true;
  noMoreBlueprints = false;
  loadError = false;
  // null = first page ("older than now" server-side). A concrete Date.now()
  // here would make every page-1 URL unique and defeat the CDN cache.
  oldestDate: Date | null = null;
  filterName = "";
  // Superseded by filterDlcs — no sidebar control writes it any more, but the
  // param is still read, sent and shown as a chip so links predating the DLC
  // filter keep working until gameVersion is dropped altogether.
  filterGameVersion: string | null = null;
  /** Selected DLC ids; empty = no DLC restriction. Multi-select: the server
   * matches blueprints requiring ANY of them ($in). */
  filterDlcs: string[] = [];
  filterCategory: string | null = null;
  filterSubcategory: string | null = null;
  filterModded: boolean | null = null;
  filterForkedFrom: string | null = null;
  filterRooms: string | null = null;
  remaining = 0;
  sort: BlueprintSort = DEFAULT_SORT;
  skipCount = 0;
  private requestId = 0;

  viewMode: "discover" | "feed" = "discover";
  followingCount = 0;
  /** mobile-only: whether the facet sidebar disclosure is open */
  filtersOpen = false;

  /** true while the grid fades out during a list-context switch */
  listSwitching = false;
  private switchTimer: ReturnType<typeof setTimeout> | null = null;
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResponse: BlueprintListResponse | null = null;
  private pendingError = false;
  private awaitingFade = false;
  private placeholdersShownAt = 0;

  readonly sortOptions: { label: string; value: BlueprintSort }[] = [
    // Trending is the default (DEFAULT_SORT) — listed first.
    { label: $localize`:browse.sortTrending:Trending`, value: "trending" },
    { label: $localize`:browse.sortNewest:Newest`, value: "recent" },
    { label: $localize`:browse.sortTopRated:Top rated`, value: "popular" },
    {
      label: $localize`:browse.sortMostForked:Most forked`,
      value: "mostForked",
    },
    {
      label: $localize`:browse.sortMostViewed:Most viewed`,
      value: "mostViewed",
    },
    {
      label: $localize`:browse.sortMostDownloaded:Most downloaded`,
      value: "mostDownloaded",
    },
  ];

  // Labels come from lib (checked against the game's own strings), never from
  // pack names written out here. Ordered by label so the sidebar reads
  // alphabetically rather than by Klei's id numbering.
  readonly dlcOptions: { label: string; value: string }[] = Object.keys(
    DLC_LABELS,
  )
    .map((id) => ({ label: dlcLabel(id), value: id }))
    .sort((a, b) => a.label.localeCompare(b.label));
  readonly categoryOptions = [
    { label: "All categories", value: null },
    ...CATEGORIES.map((c) => ({ label: c, value: c })),
  ];
  readonly roomOptions: { label: string; value: string | null }[] = [
    { label: $localize`:browse.allRooms:All rooms`, value: null },
    ...ROOM_TYPE_IDS.map((id) => ({
      label: ROOM_TYPE_LABELS[id],
      value: id as string,
    })).sort((a, b) => a.label.localeCompare(b.label)),
  ];

  get subcategoryOptions(): { label: string; value: string | null }[] {
    if (!this.filterCategory) return [];
    const subs =
      SUBCATEGORIES[this.filterCategory as keyof typeof SUBCATEGORIES] ?? [];
    return [
      { label: "All", value: null },
      ...(subs as readonly string[]).map((s) => ({ label: s, value: s })),
    ];
  }

  filterNameSubject = new Subject<string>();
  filterFacetSubject = new Subject<void>();

  loadingBlueprintItem: BlueprintListItem;
  nothingBlueprintItem: BlueprintListItem;

  constructor(
    private blueprintService: BlueprintService,
    private authService: AuthenticationService,
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const tempDate = new Date();
    this.loadingBlueprintItem = {
      id: null as any,
      name: LOADING_STR,
      ownerId: "",
      ownerName: LOADING_STR,
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg",
      isPublished: true,
      nbRatings: 0,
      rating: 0,
      commentCount: 0,
      nbForks: 0,
      nbViews: 0,
      nbDownloads: 0,
    };

    this.nothingBlueprintItem = {
      id: null as any,
      name: NO_RESULTS_STR,
      ownerId: "",
      ownerName: "",
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg_nothing",
      isPublished: true,
      nbRatings: 0,
      rating: 0,
      commentCount: 0,
      nbForks: 0,
      nbViews: 0,
      nbDownloads: 0,
    };

    this.filterNameSubject.pipe(debounceTime(600)).subscribe(() => {
      this.applyFiltersToUrl();
      this.transitionList();
    });

    this.filterFacetSubject.pipe(debounceTime(0)).subscribe(() => {
      this.applyFiltersToUrl();
      this.transitionList();
    });
  }

  private initialized = false;
  private paramsSub?: Subscription;

  ngOnInit() {
    // Subscribe (not snapshot): badge links on cards navigate to /discover
    // with new params while this component is already active, so the same
    // instance must react. Our own applyFiltersToUrl writes come back
    // through here too — readFiltersFromParams reports them as unchanged,
    // which prevents a duplicate fetch.
    this.paramsSub = this.route.queryParamMap.subscribe((params) => {
      const changed = this.readFiltersFromParams(params);
      if (!this.initialized) {
        this.initialized = true;
        this.appendLoading();
        this.getBlueprints();
      } else if (changed) {
        this.transitionList();
      }
    });

    if (this.loggedIn) {
      const me = this.authService.getUserDetails()?.username;
      if (me) {
        this.userService.getProfile(me).subscribe({
          next: (profile) => (this.followingCount = profile.followingCount),
          error: () => {},
        });
      }
    }
  }

  setViewMode(mode: "discover" | "feed") {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.transitionList();
  }

  ngOnDestroy() {
    this.paramsSub?.unsubscribe();
    this.filterNameSubject.complete();
    this.filterFacetSubject.complete();
    if (this.switchTimer) clearTimeout(this.switchTimer);
    if (this.dwellTimer) clearTimeout(this.dwellTimer);
  }

  /**
   * Swap the list to a new context (sort/tab/filter change) without an
   * instantaneous redraw: the grid fades out while the request runs in
   * parallel. If the response beats the fade it is applied at fade-end (no
   * placeholder flash); otherwise placeholders show and stay for a minimum
   * dwell. Reduced-motion users get the old immediate swap.
   */
  private transitionList() {
    this.resetPaging();
    if (this.prefersReducedMotion()) {
      this.blueprintListItems = [];
      this.appendLoading();
      this.getBlueprints();
      return;
    }
    this.listSwitching = true;
    this.awaitingFade = true;
    this.pendingResponse = null;
    this.pendingError = false;
    if (this.dwellTimer) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = null;
    }
    this.getBlueprints();
    if (this.switchTimer) clearTimeout(this.switchTimer);
    this.switchTimer = setTimeout(() => this.finishFadeOut(), LIST_FADE_OUT_MS);
  }

  private finishFadeOut() {
    this.switchTimer = null;
    this.awaitingFade = false;
    this.listSwitching = false;
    this.blueprintListItems = [];
    if (this.pendingResponse) {
      const response = this.pendingResponse;
      this.pendingResponse = null;
      this.handleGetBlueprints(response);
    } else if (this.pendingError) {
      this.pendingError = false;
      this.handleError();
    } else {
      this.appendLoading();
    }
  }

  private resetPaging() {
    // null = first page; a concrete Date.now() would make every page-1 URL
    // unique and defeat the CDN cache (see the field comment)
    this.oldestDate = null;
    this.skipCount = 0;
    this.noMoreBlueprints = false;
    this.working = true;
    this.remaining = 0;
    this.loadError = false;
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /** Sync filter state from URL params; true if anything changed. */
  private readFiltersFromParams(params: ParamMap): boolean {
    const name = params.get("name") ?? "";
    const gameVersion = params.get("gameVersion");
    const category = params.get("category");
    const subcategory = params.get("subcategory");
    const rawModded = params.get("modded");
    const modded =
      rawModded === "true" ? true : rawModded === "false" ? false : null;
    const forkedFrom = params.get("forkedFrom");
    // Kept as the raw param (the API accepts a comma list); the select simply
    // shows no selection for a multi-value URL, but the filter still applies.
    const rooms = params.get("rooms");
    // Accepts both ?dlc=A&dlc=B and ?dlc=A,B — we write the CSV form, but a
    // hand-built or shared link may use either.
    const dlcs = params
      .getAll("dlc")
      .flatMap((value) => value.split(","))
      .map((dlcId) => dlcId.trim())
      .filter((dlcId) => dlcId.length > 0);
    const rawSort = params.get("sort");
    const sort: BlueprintSort = this.sortOptions.some(
      (option) => option.value === rawSort,
    )
      ? (rawSort as BlueprintSort)
      : DEFAULT_SORT;

    const changed =
      name !== this.filterName ||
      gameVersion !== this.filterGameVersion ||
      category !== this.filterCategory ||
      subcategory !== this.filterSubcategory ||
      modded !== this.filterModded ||
      forkedFrom !== this.filterForkedFrom ||
      rooms !== this.filterRooms ||
      dlcs.join(",") !== this.filterDlcs.join(",") ||
      sort !== this.sort;

    this.filterName = name;
    this.filterGameVersion = gameVersion;
    this.filterCategory = category;
    this.filterSubcategory = subcategory;
    this.filterModded = modded;
    this.filterForkedFrom = forkedFrom;
    this.filterRooms = rooms;
    this.filterDlcs = dlcs;
    this.sort = sort;
    return changed;
  }

  onFacetChange() {
    this.filterSubcategory = null;
    this.filterFacetSubject.next();
  }

  /* sidebar facet clicks — no-ops when the value is already active, then
   * funnel into the same handlers the old dropdowns used */
  selectCategory(value: string | null) {
    if (this.filterCategory === value) return;
    this.filterCategory = value;
    this.onFacetChange();
  }

  selectGameVersion(value: string | null) {
    if (this.filterGameVersion === value) return;
    this.filterGameVersion = value;
    // not onFacetChange(): subcategory is scoped to category, so a
    // game-version change must not reset it
    this.filterFacetSubject.next();
  }

  isDlcSelected(dlcId: string): boolean {
    return this.filterDlcs.includes(dlcId);
  }

  /** Multi-select: packs are independent, so picking a second one widens the
   * result set ("needs any of these") instead of replacing the first. */
  toggleDlc(dlcId: string) {
    this.filterDlcs = this.isDlcSelected(dlcId)
      ? this.filterDlcs.filter((id) => id !== dlcId)
      : [...this.filterDlcs, dlcId];
    // same reasoning as selectGameVersion: subcategory is scoped to category
    this.filterFacetSubject.next();
  }

  clearDlcFilter() {
    if (this.filterDlcs.length === 0) return;
    this.filterDlcs = [];
    this.filterFacetSubject.next();
  }

  readonly dlcLabel = dlcLabel;

  selectSubcategory(value: string | null) {
    if (this.filterSubcategory === value) return;
    this.filterSubcategory = value;
    this.onSubcategoryChange();
  }

  selectRoom(value: string | null) {
    if (this.filterRooms === value) return;
    this.filterRooms = value;
    this.onRoomsChange();
  }

  selectSort(value: BlueprintSort) {
    if (this.sort === value) return;
    this.sort = value;
    this.onSortChange();
  }

  clearNameFilter() {
    if (!this.filterName) return;
    this.filterName = "";
    this.filterFacetSubject.next();
  }

  clearModdedFilter() {
    if (this.filterModded == null) return;
    this.filterModded = null;
    this.filterFacetSubject.next();
  }

  get activeFilterCount(): number {
    return (
      [
        this.filterName,
        this.filterGameVersion,
        this.filterCategory,
        this.filterSubcategory,
        this.filterRooms,
        this.filterForkedFrom,
        this.filterModded !== null || null,
      ].filter(Boolean).length + this.filterDlcs.length
    );
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  private removeChipAriaLabel(label: string): string {
    return $localize`:browse remove filter chip aria-label:Remove filter: ${label}`;
  }

  private chip(
    key: string,
    label: string,
    remove: () => void,
  ): ActiveFilterChip {
    return { key, label, ariaLabel: this.removeChipAriaLabel(label), remove };
  }

  // Pinned above the grid (not the sidebar) so an active filter combination
  // is visible even when the sidebar is scrolled out of view — the sidebar
  // alone left users unable to tell why a narrow combination (e.g. a room
  // that category's buildings never form) returned nothing.
  trackChip(_index: number, chip: ActiveFilterChip): string {
    return chip.key;
  }

  get activeFilterChips(): ActiveFilterChip[] {
    const chips: ActiveFilterChip[] = [];

    if (this.filterName)
      chips.push(
        this.chip(
          "name",
          $localize`:browse filter chip:Search: "${this.filterName}"`,
          () => this.clearNameFilter(),
        ),
      );
    if (this.filterCategory)
      chips.push(
        this.chip("category", this.filterCategory, () =>
          this.selectCategory(null),
        ),
      );
    if (this.filterSubcategory)
      chips.push(
        this.chip("subcategory", this.filterSubcategory, () =>
          this.selectSubcategory(null),
        ),
      );
    if (this.filterGameVersion)
      chips.push(
        this.chip("gameVersion", this.filterGameVersion, () =>
          this.selectGameVersion(null),
        ),
      );
    // One chip per pack, each removable on its own — unlike rooms, the sidebar
    // control here really is multi-select, so removing one must not clear the rest.
    for (const dlcId of this.filterDlcs)
      chips.push(
        this.chip(`dlc-${dlcId}`, dlcLabel(dlcId), () => this.toggleDlc(dlcId)),
      );
    if (this.filterModded != null)
      chips.push(
        this.chip(
          "modded",
          this.filterModded
            ? $localize`:browse filter chip:Modded`
            : $localize`:browse filter chip:Base game`,
          () => this.clearModdedFilter(),
        ),
      );
    if (this.filterRooms)
      for (const roomId of this.filterRooms.split(","))
        chips.push(
          this.chip(`room-${roomId}`, roomTypeLabel(roomId), () =>
            // rooms is effectively single-select from the UI (selectRoom
            // replaces, never appends), so removing any one room chip clears
            // the whole rooms filter — matches the only removal semantics
            // the sidebar itself supports.
            this.selectRoom(null),
          ),
        );

    return chips;
  }

  onSubcategoryChange() {
    this.applyFiltersToUrl();
    this.transitionList();
  }

  onRoomsChange() {
    this.applyFiltersToUrl();
    this.transitionList();
  }

  onSortChange() {
    this.applyFiltersToUrl();
    this.transitionList();
  }

  get loggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  private applyFiltersToUrl() {
    const queryParams: Record<string, string | null> = {};
    if (this.filterName) queryParams["name"] = this.filterName;
    if (this.filterGameVersion)
      queryParams["gameVersion"] = this.filterGameVersion;
    if (this.filterCategory) queryParams["category"] = this.filterCategory;
    if (this.filterSubcategory)
      queryParams["subcategory"] = this.filterSubcategory;
    if (this.filterModded != null)
      queryParams["modded"] = String(this.filterModded);
    if (this.filterForkedFrom)
      queryParams["forkedFrom"] = this.filterForkedFrom;
    if (this.filterRooms) queryParams["rooms"] = this.filterRooms;
    if (this.filterDlcs.length > 0)
      queryParams["dlc"] = this.filterDlcs.join(",");
    if (this.sort !== DEFAULT_SORT) queryParams["sort"] = this.sort;
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  clearFilters() {
    this.filterName = "";
    this.filterGameVersion = null;
    this.filterCategory = null;
    this.filterSubcategory = null;
    this.filterModded = null;
    this.filterForkedFrom = null;
    this.filterRooms = null;
    this.filterDlcs = [];
    this.applyFiltersToUrl();
    this.transitionList();
  }

  @HostListener("window:scroll")
  onWindowScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total = document.documentElement.scrollHeight;
    if (!this.noMoreBlueprints && !this.working && scrolled > total - 300) {
      this.loadMore();
    }
  }

  isReal(thumbnail: string): boolean {
    return thumbnail !== "svg" && thumbnail !== "svg_nothing";
  }

  getBlueprints() {
    this.loadError = false;
    const requestId = ++this.requestId;

    const request$ =
      this.viewMode === "feed"
        ? // feed is always authed (no-store), so a concrete cursor costs nothing
          this.userService.getFeed(this.oldestDate ?? new Date())
        : this.blueprintService.getBlueprints(
            this.oldestDate,
            null,
            this.filterName.trim() || null,
            this.filterGameVersion,
            this.filterCategory,
            this.filterSubcategory,
            this.sort,
            this.sort !== "recent" ? this.skipCount : undefined,
            this.filterModded,
            this.filterForkedFrom,
            null,
            this.filterRooms,
            this.filterDlcs.length > 0 ? this.filterDlcs.join(",") : null,
          );

    request$.subscribe({
      next: (r: any) => {
        if (requestId === this.requestId) this.receiveListResponse(r);
      },
      error: () => {
        if (requestId === this.requestId) this.receiveListError();
      },
    });
  }

  /** Gate responses through the transition: hold them until the fade-out
   * ends, and give visible placeholders their minimum dwell. */
  private receiveListResponse(response: BlueprintListResponse) {
    if (this.awaitingFade) {
      this.pendingResponse = response;
      return;
    }
    const placeholdersVisible = this.blueprintListItems.includes(
      this.loadingBlueprintItem,
    );
    const dwellLeft = placeholdersVisible
      ? MIN_PLACEHOLDER_MS - (Date.now() - this.placeholdersShownAt)
      : 0;
    if (dwellLeft > 0 && !this.prefersReducedMotion()) {
      const requestId = this.requestId;
      this.dwellTimer = setTimeout(() => {
        this.dwellTimer = null;
        if (requestId === this.requestId) this.handleGetBlueprints(response);
      }, dwellLeft);
      return;
    }
    this.handleGetBlueprints(response);
  }

  private receiveListError() {
    if (this.awaitingFade) {
      this.pendingError = true;
      return;
    }
    this.handleError();
  }

  handleError() {
    this.working = false;
    this.loadError = true;
    this.blueprintListItems = this.blueprintListItems.filter(
      (i) => i !== this.loadingBlueprintItem,
    );
  }

  handleGetBlueprints(response: BlueprintListResponse) {
    this.working = false;
    this.loadError = false;
    // An empty page must not touch the cursor: the server dates `oldest` as
    // "now" when it has nothing, and adopting that would restart pagination
    // from the top and re-append the first page forever.
    if (response.blueprints.length > 0)
      this.oldestDate = new Date(response.oldest);
    // non-"recent" sorts (popular, mostForked) paginate by offset — advance past what we just received
    this.skipCount += response.blueprints.length;
    this.remaining = response.remaining ?? 0;
    if (this.remaining === 0 || response.blueprints.length === 0)
      this.noMoreBlueprints = true;

    this.blueprintListItems = this.blueprintListItems.filter(
      (i) => i !== this.loadingBlueprintItem,
    );
    response.blueprints.forEach((item) => this.blueprintListItems.push(item));

    if (this.blueprintListItems.length === 0) {
      this.nothingBlueprintItem.name = this.hasActiveFilters
        ? NO_RESULTS_FILTERED_STR
        : NO_RESULTS_STR;
      this.blueprintListItems.push(this.nothingBlueprintItem);
    }
  }

  loadMore() {
    this.working = true;
    this.appendLoading();
    this.getBlueprints();
  }

  appendLoading() {
    this.placeholdersShownAt = Date.now();
    for (let i = 0; i < 6; i++)
      this.blueprintListItems.push(this.loadingBlueprintItem);
  }
}
