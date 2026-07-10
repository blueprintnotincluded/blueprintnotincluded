import { Component, OnInit, ViewChild, ElementRef } from "@angular/core";
import {
  BlueprintListItem,
  BlueprintListResponse,
} from "../../../../../../../lib/index";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { Dialog } from "primeng/dialog";
import { DatePipe } from "@angular/common";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { Subject } from "rxjs";
import { debounceTime } from "rxjs/operators";

const LOADING_STR = $localize`Loading...`;

@Component({
  selector: "app-dialog-browse",
  templateUrl: "./dialog-browse.component.html",
  styleUrls: ["./dialog-browse.component.css"],
  standalone: false,
})
export class DialogBrowseComponent implements OnInit {
  @ViewChild("browseDialog", { static: true }) browseDialog!: Dialog;
  @ViewChild("scrollable", { static: true }) scrollable!: ElementRef;

  visible: boolean = false;
  blueprintListItems!: BlueprintListItem[];

  working!: boolean;
  noMoreBlueprints!: boolean;
  oldestDate!: Date;
  filterUserId!: string;
  filterUserName!: string;
  remaining!: number;

  filterUser!: boolean;
  filterNameSubject = new Subject<string>();
  filterName!: string;

  loadingBlueprintItem: BlueprintListItem;
  nothingBlueprintItem: BlueprintListItem;

  constructor(
    private blueprintService: BlueprintService,
    public authService: AuthenticationService,
    public datepipe: DatePipe
  ) {
    let tempDate = new Date();
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
    };

    this.nothingBlueprintItem = {
      id: null as any,
      name: $localize`:nothingBlueprintItem.name:No Results`,
      ownerId: "",
      ownerName: LOADING_STR,
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg_nothing",
      isPublished: true,
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
      commentCount: 0,
      nbForks: 0,
    };

    this.filterNameSubject
      .pipe(debounceTime(1000))
      //,distinctUntilChanged())
      .subscribe((_value) => {
        this.filterNameChange();
      });

    this.filterNameSubject.subscribe((_value) => {
      this.removeAll();
    });
  }

  isReal(thumbnail: string): boolean {
    return thumbnail != "svg" && thumbnail != "svg_nothing";
  }

  previewUrl(item: BlueprintListItem): string {
    const version = item.modifiedAt ? new Date(item.modifiedAt).getTime() : 0;
    return `/api/blueprints/${item.id}/preview/card.webp?v=${version}`;
  }

  ngOnInit() {
    this.browseDialog.onShow.subscribe({
      next: this.handleOnShow.bind(this),
    });

    this.reset();
  }

  // This is used when clicking on the checkbox
  filterUserChange() {
    if (this.filterUser == false) {
      this.removeAll();
      this.filterUserId = null as any;
      this.filterUserName = null as any;
      this.oldestDate = new Date();
      this.getBlueprints();
    }
  }

  filterNameChange() {
    this.removeAll();
    this.oldestDate = new Date();
    this.getBlueprints();
  }

  // This is used by links
  filterOwner(id: string, name: string) {
    this.filterUser = true;
    this.filterUserId = id;
    this.filterUserName = name;
    this.removeAll();
    this.getBlueprints();
  }

  getBlueprints() {
    let filterName: string | null = null;
    if (this.filterName != "" && this.filterName != null)
      filterName = this.filterName;

    this.blueprintService
      .getBlueprints(this.oldestDate, this.filterUserId || null, filterName)
      .subscribe({
        next: (r: any) => this.handleGetBlueprints(r),
      });
  }

  deleteBlueprint(item: BlueprintListItem) {
    this.blueprintService.deleteBlueprint(item.id).subscribe({
      next: this.handleDeleteNext.bind(this),
      error: this.handleDeleteError.bind(this),
    });
  }

  handleDeleteNext() {
    // TODO Just splice the blueprint here, and assume it worked
    this.removeAll();
    this.getBlueprints();
  }

  handleDeleteError() {
    // TODO cleaner handling here, but I don't remember how to do it
    console.error("Error when deleting blueprint");
  }

  reset() {
    this.filterUser = false;
    this.filterUserId = null as any;
    this.filterUserName = null as any;
    this.filterName = null as any;

    this.removeAll();
  }

  removeAll() {
    this.noMoreBlueprints = false;
    this.oldestDate = new Date();
    this.working = true;
    this.scrollable.nativeElement.scrollTop = 0;
    this.remaining = 6;
    this.blueprintListItems = [];
    this.appendTemp();
  }

  appendTemp() {
    for (let i = 0; i < this.remaining; i++)
      this.blueprintListItems.push(this.loadingBlueprintItem);
  }

  handleTitleClick(event: MouseEvent, _item: BlueprintListItem) {
    // Only handle the click if it's a normal left click (no modifier keys)
    // Let routerLink handle modifier+click and right-click naturally
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.button === 0
    ) {
      this.hideDialog();
      // Let routerLink handle the navigation - don't prevent default
    }
  }

  hideDialog() {
    this.visible = false;
  }

  showDialog(
    filterUserId: string | null = null,
    filterUserName: string | null = null
  ) {
    this.reset();
    if (filterUserId != null) {
      this.filterUserId = filterUserId;
      this.filterUserName = filterUserName!;
      this.filterUser = true;
    }
    this.getBlueprints();
    this.visible = true;
  }

  handleOnShow() {
    this.scrollable.nativeElement.addEventListener(
      "scroll",
      this.scroll.bind(this)
    );
  }

  scroll(_e: Event) {
    let scrollTop: number = this.scrollable.nativeElement.scrollTop;
    let scrollMax: number =
      this.scrollable.nativeElement.scrollHeight -
      this.scrollable.nativeElement.clientHeight;
    //console.log('scroll')
    //console.log({scrollTop: scrollTop, scrollMax: scrollMax});
    if (!this.noMoreBlueprints && !this.working && scrollTop > scrollMax - 5) {
      this.loadMoreBlueprints();
    }
  }

  handleGetBlueprints(blueprintListResponse: BlueprintListResponse) {
    this.working = false;
    this.oldestDate = new Date(blueprintListResponse.oldest);
    this.remaining = blueprintListResponse.remaining;

    if (this.remaining == 0) this.noMoreBlueprints = true;

    this.blueprintListItems = this.blueprintListItems.filter((i) => {
      return i != this.loadingBlueprintItem;
    });

    blueprintListResponse.blueprints.map((item) => {
      this.blueprintListItems.push(item);
    });

    if (this.blueprintListItems.length == 0)
      this.blueprintListItems.push(this.nothingBlueprintItem);
  }

  loadMoreBlueprints() {
    this.working = true;
    this.appendTemp();
    this.getBlueprints();
  }
}
