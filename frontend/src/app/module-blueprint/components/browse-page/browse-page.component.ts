import { Component, OnInit, OnDestroy, HostListener } from "@angular/core";
import {
  BlueprintListItem,
  BlueprintListResponse,
} from "../../../../../../lib/index";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { DatePipe } from "@angular/common";
import { Subject } from "rxjs";
import { debounceTime } from "rxjs/operators";

const LOADING_STR = $localize`Loading...`;
const NO_RESULTS_STR = $localize`:browse.noResults:No Results`;

@Component({
  selector: "app-browse-page",
  templateUrl: "./browse-page.component.html",
  styleUrls: ["./browse-page.component.css"],
  standalone: false,
})
export class BrowsePageComponent implements OnInit, OnDestroy {
  blueprintListItems: BlueprintListItem[] = [];
  working = true;
  noMoreBlueprints = false;
  oldestDate = new Date();
  filterName = "";
  remaining = 0;

  filterNameSubject = new Subject<string>();

  loadingBlueprintItem: BlueprintListItem;
  nothingBlueprintItem: BlueprintListItem;

  constructor(
    private blueprintService: BlueprintService,
    public datepipe: DatePipe
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

    this.filterNameSubject.pipe(debounceTime(1000)).subscribe(() => {
      this.reset();
      this.getBlueprints();
    });
  }

  ngOnInit() {
    this.appendLoading();
    this.getBlueprints();
  }

  ngOnDestroy() {
    this.filterNameSubject.complete();
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
    this.blueprintService
      .getBlueprints(this.oldestDate, null, name, false)
      .subscribe({
        next: (r: any) => this.handleGetBlueprints(r),
      });
  }

  handleGetBlueprints(response: BlueprintListResponse) {
    this.working = false;
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
