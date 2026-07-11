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
  GAME_VERSIONS,
  CATEGORIES,
  SUBCATEGORIES,
} from "../../../../../../lib/index";
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
import { BrowseData } from "../user-menu/user-menu.component";

const LOADING_STR = $localize`Loading...`;
const NO_RESULTS_STR = $localize`:browse.noResults:No Results`;

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
  oldestDate = new Date();
  filterName = "";
  filterUserId: string | null = null;
  filterGameVersion: string | null = null;
  filterCategory: string | null = null;
  filterSubcategory: string | null = null;
  filterModded: boolean | null = null;
  filterForkedFrom: string | null = null;
  remaining = 0;
  sort: BlueprintSort = "recent";
  skipCount = 0;
  private requestId = 0;

  viewMode: "discover" | "feed" = "discover";
  followingCount = 0;

  readonly sortOptions: { label: string; value: BlueprintSort }[] = [
    { label: $localize`:browse.sortNewest:Newest`, value: "recent" },
    { label: $localize`:browse.sortMostLiked:Most liked`, value: "popular" },
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

  readonly gameVersionOptions = [
    { label: "All versions", value: null },
    ...GAME_VERSIONS.map((v) => ({ label: v, value: v })),
  ];
  readonly categoryOptions = [
    { label: "All categories", value: null },
    ...CATEGORIES.map((c) => ({ label: c, value: c })),
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
    private router: Router
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
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
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
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
      commentCount: 0,
      nbForks: 0,
      nbViews: 0,
      nbDownloads: 0,
    };

    this.filterNameSubject.pipe(debounceTime(600)).subscribe(() => {
      this.applyFiltersToUrl();
      this.reset();
      this.getBlueprints();
    });

    this.filterFacetSubject.pipe(debounceTime(0)).subscribe(() => {
      this.applyFiltersToUrl();
      this.reset();
      this.getBlueprints();
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
        this.reset();
        this.getBlueprints();
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
    this.reset();
    this.getBlueprints();
  }

  ngOnDestroy() {
    this.paramsSub?.unsubscribe();
    this.filterNameSubject.complete();
    this.filterFacetSubject.complete();
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
    const rawSort = params.get("sort");
    const sort: BlueprintSort = this.sortOptions.some(
      (option) => option.value === rawSort
    )
      ? (rawSort as BlueprintSort)
      : "recent";

    const changed =
      name !== this.filterName ||
      gameVersion !== this.filterGameVersion ||
      category !== this.filterCategory ||
      subcategory !== this.filterSubcategory ||
      modded !== this.filterModded ||
      forkedFrom !== this.filterForkedFrom ||
      sort !== this.sort;

    this.filterName = name;
    this.filterGameVersion = gameVersion;
    this.filterCategory = category;
    this.filterSubcategory = subcategory;
    this.filterModded = modded;
    this.filterForkedFrom = forkedFrom;
    this.sort = sort;
    return changed;
  }

  onFacetChange() {
    this.filterSubcategory = null;
    this.filterFacetSubject.next();
  }

  onSubcategoryChange() {
    this.applyFiltersToUrl();
    this.reset();
    this.getBlueprints();
  }

  onSortChange() {
    this.applyFiltersToUrl();
    this.reset();
    this.getBlueprints();
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
    if (this.sort !== "recent") queryParams["sort"] = this.sort;
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  clearFilters() {
    this.filterName = "";
    this.filterGameVersion = null;
    this.filterCategory = null;
    this.filterSubcategory = null;
    this.filterModded = null;
    this.filterForkedFrom = null;
    this.applyFiltersToUrl();
    this.reset();
    this.getBlueprints();
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
        ? this.userService.getFeed(this.oldestDate)
        : this.blueprintService.getBlueprints(
            this.oldestDate,
            this.filterUserId,
            this.filterName.trim() || null,
            this.filterGameVersion,
            this.filterCategory,
            this.filterSubcategory,
            this.sort,
            this.sort !== "recent" ? this.skipCount : undefined,
            this.filterModded,
            this.filterForkedFrom
          );

    request$.subscribe({
      next: (r: any) => {
        if (requestId === this.requestId) this.handleGetBlueprints(r);
      },
      error: () => {
        if (requestId === this.requestId) this.handleError();
      },
    });
  }

  showMyBlueprints(data: BrowseData) {
    this.filterUserId = data.filterUserId;
    this.reset();
    this.getBlueprints();
  }

  handleError() {
    this.working = false;
    this.loadError = true;
    this.blueprintListItems = this.blueprintListItems.filter(
      (i) => i !== this.loadingBlueprintItem
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
      (i) => i !== this.loadingBlueprintItem
    );
    response.blueprints.forEach((item) => this.blueprintListItems.push(item));

    if (this.blueprintListItems.length === 0)
      this.blueprintListItems.push(this.nothingBlueprintItem);
  }

  loadMore() {
    this.working = true;
    this.appendLoading();
    this.getBlueprints();
  }

  appendLoading() {
    for (let i = 0; i < 6; i++)
      this.blueprintListItems.push(this.loadingBlueprintItem);
  }

  reset() {
    this.blueprintListItems = [];
    this.oldestDate = new Date();
    this.skipCount = 0;
    this.noMoreBlueprints = false;
    this.working = true;
    this.remaining = 0;
    this.appendLoading();
  }
}
