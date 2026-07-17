import { Component, OnInit, ViewChild } from "@angular/core";
import { Location } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { EMPTY, Observable } from "rxjs";
import { catchError, finalize, switchMap, tap } from "rxjs/operators";
import {
  BlueprintDetailsResponse,
  BlueprintListItem,
  BlueprintRateResponse,
} from "../../../../../../lib/index";
import { MessageService } from "primeng/api";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";
import { VersionHistoryDialogComponent } from "../dialogs/version-history-dialog/version-history-dialog.component";
import { BrowseData } from "../user-menu/user-menu.component";
import {
  categoryTooltip,
  subcategoryTooltip,
  gameVersionTooltip,
  moddedTooltip,
  roomTooltip,
} from "../../utils/chip-tooltip";
import { roomTypeLabel } from "../../utils/room-labels";

const BACK_TO_DISCOVER = $localize`:blueprintDetails.backToDiscover:Back to Discover`;
const BACK_TO_PROFILE = $localize`:blueprintDetails.backToProfile:Back to Profile`;

@Component({
  selector: "app-blueprint-details-page",
  templateUrl: "./blueprint-details-page.component.html",
  styleUrls: ["./blueprint-details-page.component.css"],
  standalone: false,
})
export class BlueprintDetailsPageComponent implements OnInit {
  @ViewChild("versionHistoryDialog")
  versionHistoryDialog!: VersionHistoryDialogComponent;

  details: BlueprintDetailsResponse | null = null;
  blueprintId: string | null = null;
  loading = true;
  notFound = false;
  loadError = false;
  relatedBlueprints: BlueprintListItem[] = [];

  backLink: any[] = ["/discover"];
  backLabel = BACK_TO_DISCOVER;

  readonly categoryTooltip = categoryTooltip;
  readonly subcategoryTooltip = subcategoryTooltip;
  readonly gameVersionTooltip = gameVersionTooltip;
  readonly moddedTooltip = moddedTooltip;
  readonly roomTooltip = roomTooltip;
  readonly roomTypeLabel = roomTypeLabel;

  private pendingFragment: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private blueprintService: BlueprintService,
    private messageService: MessageService,
    public authService: AuthenticationService,
  ) {}

  goToProfile(data: BrowseData) {
    this.router.navigate(["/profile", data.filterUserName]);
  }

  // Complete singular/plural messages (not a conditional suffix) so
  // translators control each form
  get nbForksString() {
    return (this.details?.nbForks ?? 0) === 1
      ? $localize`:forkSingular:fork`
      : $localize`:forkPlural:forks`;
  }

  get nbViewsString() {
    return (this.details?.nbViews ?? 0) === 1
      ? $localize`:viewSingular:view`
      : $localize`:viewPlural:views`;
  }

  get nbDownloadsString() {
    return (this.details?.nbDownloads ?? 0) === 1
      ? $localize`:downloadSingular:download`
      : $localize`:downloadPlural:downloads`;
  }

  ngOnInit() {
    this.route.paramMap
      .pipe(
        tap(() => this.updateBackLink()),
        switchMap((params) => this.load(params.get("id"))),
      )
      .subscribe((details) => {
        if (details == null) return;
        this.details = details;
        this.blueprintId = details.id;
        this.loading = false;
        this.loadRelatedBlueprints(details.id);
      });

    this.route.fragment.subscribe((fragment) => {
      this.pendingFragment = fragment;
    });
  }

  scrollToFragment() {
    if (this.pendingFragment == null) return;
    const target = document.getElementById(this.pendingFragment);
    if (target != null) target.scrollIntoView({ block: "center" });
    this.pendingFragment = null;
  }

  private updateBackLink() {
    const state = this.location.getState() as { fromProfile?: string } | null;
    if (state?.fromProfile) {
      this.backLink = ["/profile", state.fromProfile];
      this.backLabel = BACK_TO_PROFILE;
    } else {
      this.backLink = ["/discover"];
      this.backLabel = BACK_TO_DISCOVER;
    }
  }

  private load(id: string | null): Observable<BlueprintDetailsResponse | null> {
    this.details = null;
    this.blueprintId = null;
    this.notFound = false;
    this.loadError = false;
    this.previewFailed = false;
    this.publishWorking = false;
    this.relatedBlueprints = [];

    if (id == null) {
      this.loading = false;
      return EMPTY;
    }

    this.loading = true;
    return this.blueprintService.getBlueprintDetails(id).pipe(
      catchError((err) => {
        if (err?.status === 404) this.notFound = true;
        else this.loadError = true;
        this.loading = false;
        return EMPTY;
      }),
    );
  }

  // Decoration on the page — a failure here must never surface an error to
  // the user, the shelf just stays empty.
  private loadRelatedBlueprints(id: string) {
    this.blueprintService.getRelatedBlueprints(id).subscribe({
      next: (response) => (this.relatedBlueprints = response.blueprints),
      error: (err) => console.warn("Failed to load related blueprints", err),
    });
  }

  get loggedIn() {
    return this.authService.isLoggedIn();
  }

  // Fresh aggregate from the rate endpoint — keep hero stars in sync
  onRated(response: BlueprintRateResponse) {
    if (this.details == null) return;
    this.details.rating = response.rating;
    this.details.nbRatings = response.nbRatings;
    this.details.myRating = response.myRating;
  }

  hasRealThumbnail(): boolean {
    return (
      this.details != null &&
      this.details.thumbnail !== "svg" &&
      this.details.thumbnail !== "svg_nothing"
    );
  }

  /** Falls back to the legacy inline thumbnail when the server render 404s/errors. */
  previewFailed = false;

  heroPreviewUrl(): string {
    const version = this.details?.modifiedAt
      ? new Date(this.details.modifiedAt).getTime()
      : 0;
    return `/api/blueprints/${this.details?.id}/preview/hero.webp?v=${version}`;
  }

  openVersionHistory() {
    if (this.details == null) return;
    this.versionHistoryDialog.showDialog(
      this.details.id,
      this.details.ownedByMe,
    );
  }

  get shareTitle(): string {
    return this.details?.isPublished === false
      ? $localize`:shareDraftHint:Publish to share`
      : "";
  }

  publishWorking = false;

  togglePublish(publish: boolean) {
    if (this.details == null || this.publishWorking) return;
    const details = this.details;
    this.publishWorking = true;
    this.blueprintService
      .setPublished(details.id, publish)
      .pipe(finalize(() => (this.publishWorking = false)))
      .subscribe({
        next: (response) => {
          details.isPublished = response.isPublished;
          this.messageService.add({
            severity: "success",
            summary: publish
              ? $localize`:publishToast:${details.name} published! It's now visible to everyone`
              : $localize`:unpublishToast:${details.name} moved back to drafts`,
          });
        },
        error: () => {
          this.messageService.add({
            severity: "error",
            summary: publish
              ? $localize`:publishError:Could not publish blueprint`
              : $localize`:unpublishError:Could not unpublish blueprint`,
          });
        },
      });
  }
}
