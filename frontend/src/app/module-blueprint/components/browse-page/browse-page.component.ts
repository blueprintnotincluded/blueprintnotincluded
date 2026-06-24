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
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { Subject } from "rxjs";
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
  remaining = 0;

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
    public datepipe: DatePipe,
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
      tags: null as any,
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
    };

    this.nothingBlueprintItem = {
      id: null as any,
      name: NO_RESULTS_STR,
      ownerId: "",
      ownerName: "",
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg_nothing",
      tags: null as any,
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
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

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    this.filterName = params.get("name") ?? "";
    this.filterGameVersion = params.get("gameVersion");
    this.filterCategory = params.get("category");
    this.filterSubcategory = params.get("subcategory");
    this.appendLoading();
    this.getBlueprints();
  }

  ngOnDestroy() {
    this.filterNameSubject.complete();
    this.filterFacetSubject.complete();
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

  private applyFiltersToUrl() {
    const queryParams: Record<string, string | null> = {};
    if (this.filterName) queryParams["name"] = this.filterName;
    if (this.filterGameVersion)
      queryParams["gameVersion"] = this.filterGameVersion;
    if (this.filterCategory) queryParams["category"] = this.filterCategory;
    if (this.filterSubcategory)
      queryParams["subcategory"] = this.filterSubcategory;
    this.router.navigate([], { queryParams, replaceUrl: true });
  }

  clearFilters() {
    this.filterName = "";
    this.filterGameVersion = null;
    this.filterCategory = null;
    this.filterSubcategory = null;
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
    const name = this.filterName.trim() || null;
    this.loadError = false;
    this.blueprintService
      .getBlueprints(
        this.oldestDate,
        this.filterUserId,
        name,
        false,
        this.filterGameVersion,
        this.filterCategory,
        this.filterSubcategory
      )
      .subscribe({
        next: (r: any) => this.handleGetBlueprints(r),
        error: () => this.handleError(),
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
    this.oldestDate = new Date(response.oldest);
    this.remaining = response.remaining;
    if (this.remaining === 0) this.noMoreBlueprints = true;

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
    this.noMoreBlueprints = false;
    this.working = true;
    this.remaining = 0;
    this.appendLoading();
  }
}
