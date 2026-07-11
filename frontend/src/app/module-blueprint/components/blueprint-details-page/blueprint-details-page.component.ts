import { Component, OnInit, ViewChild } from "@angular/core";
import { Location } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { EMPTY, Observable } from "rxjs";
import { catchError, finalize, switchMap, tap } from "rxjs/operators";
import { BlueprintDetailsResponse } from "../../../../../../lib/index";
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
} from "../../utils/chip-tooltip";

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

  backLink: any[] = ["/discover"];
  backLabel = BACK_TO_DISCOVER;

  readonly categoryTooltip = categoryTooltip;
  readonly subcategoryTooltip = subcategoryTooltip;
  readonly gameVersionTooltip = gameVersionTooltip;
  readonly moddedTooltip = moddedTooltip;

  private pendingFragment: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private blueprintService: BlueprintService,
    private messageService: MessageService,
    public authService: AuthenticationService
  ) {}

  goToProfile(data: BrowseData) {
    this.router.navigate(["/profile", data.filterUserName]);
  }

  get nbForksString() {
    const nbForks = this.details?.nbForks ?? 0;
    return $localize`fork${nbForks !== 1 ? "s" : ""}`;
  }

  get nbViewsString() {
    const nbViews = this.details?.nbViews ?? 0;
    return $localize`view${nbViews !== 1 ? "s" : ""}`;
  }

  get nbDownloadsString() {
    const nbDownloads = this.details?.nbDownloads ?? 0;
    return $localize`download${nbDownloads !== 1 ? "s" : ""}`;
  }

  ngOnInit() {
    this.route.paramMap
      .pipe(
        tap(() => this.updateBackLink()),
        switchMap((params) => this.load(params.get("id")))
      )
      .subscribe((details) => {
        if (details == null) return;
        this.details = details;
        this.blueprintId = details.id;
        this.loading = false;
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
      })
    );
  }

  get loggedIn() {
    return this.authService.isLoggedIn();
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
      this.details.ownedByMe
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
