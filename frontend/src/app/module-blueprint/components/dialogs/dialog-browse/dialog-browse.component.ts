import {
  Component,
  OnInit,
  ViewChild,
  ChangeDetectorRef,
  HostListener,
  AfterContentInit,
  ElementRef,
} from "@angular/core";
import { Router } from "@angular/router";
import {
  BlueprintListItem,
  BlueprintListResponse,
} from "../../../../../../../lib/index";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { Dialog } from "primeng/dialog";
import { DatePipe } from "@angular/common";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { timingSafeEqual } from "crypto";
import { timer, Subject } from "rxjs";
import { switchMap, debounceTime, distinctUntilChanged } from "rxjs/operators";

const LOADING_STR = $localize`Loading...`;

@Component({
  selector: "app-dialog-browse",
  templateUrl: "./dialog-browse.component.html",
  styleUrls: ["./dialog-browse.component.css"],
})
export class DialogBrowseComponent implements OnInit {
  @ViewChild("browseDialog", { static: true }) browseDialog: Dialog;
  @ViewChild("scrollable", { static: true }) scrollable: ElementRef;

  visible: boolean = false;
  blueprintListItems: BlueprintListItem[];

  working: boolean;
  noMoreBlueprints: boolean;
  oldestDate: Date;
  filterUserId: string;
  filterUserName: string;
  remaining: number;

  filterUser: boolean;
  getDuplicates: boolean;
  filterNameSubject = new Subject<string>();
  filterName: string;

  loadingBlueprintItem: BlueprintListItem;
  nothingBlueprintItem: BlueprintListItem;

  constructor(
    private blueprintService: BlueprintService,
    public authService: AuthenticationService,
    public datepipe: DatePipe,
    private router: Router
  ) {
    let tempDate = new Date();
    this.loadingBlueprintItem = {
      id: null,
      name: LOADING_STR,
      ownerId: "",
      ownerName: LOADING_STR,
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg",
      tags: null,
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
    };

    this.nothingBlueprintItem = {
      id: null,
      name: $localize`:nothingBlueprintItem.name:No Results`,
      ownerId: "",
      ownerName: LOADING_STR,
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg_nothing",
      tags: null,
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
    };

    this.filterNameSubject
      .pipe(debounceTime(1000))
      //,distinctUntilChanged())
      .subscribe((value) => {
        this.filterNameChange();
      });

    this.filterNameSubject.subscribe((value) => {
      this.removeAll();
    });
  }

  isReal(thumbnail: string): boolean {
    return thumbnail != "svg" && thumbnail != "svg_nothing";
  }

  ngOnInit() {
    this.browseDialog.onShow.subscribe({
      next: this.handleOnShow.bind(this),
    });

    this.reset();
  }

  duplicateChange() {
    this.removeAll();
    this.oldestDate = new Date();
    this.getBlueprints();
  }

  // This is used when clicking on the checkbox
  filterUserChange() {
    if (this.filterUser == false) {
      this.removeAll();
      this.filterUserId = null;
      this.filterUserName = null;
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
    let filterName = null;
    if (this.filterName != "" && this.filterName != null)
      filterName = this.filterName;

    this.blueprintService
      .getBlueprints(
        this.oldestDate,
        this.filterUserId,
        filterName,
        this.getDuplicates
      )
      .subscribe({
        next: this.handleGetBlueprints.bind(this),
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
    console.log("Error when deleting blueprint");
  }

  reset() {
    this.filterUser = false;
    this.filterUserId = null;
    this.filterUserName = null;
    this.getDuplicates = false;
    this.filterName = null;

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

  handleTitleClick(event: MouseEvent, item: BlueprintListItem) {
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
    filterUserId: string = null,
    filterUserName: string = null,
    getDuplicates: boolean = false
  ) {
    this.reset();
    if (filterUserId != null) {
      this.filterUserId = filterUserId;
      this.filterUserName = filterUserName;
      this.filterUser = true;
    }
    this.getDuplicates = getDuplicates;
    this.getBlueprints();
    this.visible = true;
  }

  handleOnShow() {
    this.scrollable.nativeElement.addEventListener(
      "scroll",
      this.scroll.bind(this)
    );
  }

  scroll(e: Event) {
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
