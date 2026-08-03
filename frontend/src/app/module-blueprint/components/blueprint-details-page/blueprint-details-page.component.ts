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
import {
  baseGameTooltip,
  categoryTooltip,
  subcategoryTooltip,
  dlcTooltip,
  moddedTooltip,
  modChipTooltip,
  roomTooltip,
} from "../../utils/chip-tooltip";
import { dlcLabel } from "../../../../../../lib/index";
import { roomTypeLabel } from "../../utils/room-labels";
import sanitize from "sanitize-filename";
import { ModsService } from "../../services/mods-service";
import { TranslationService } from "../../services/translation.service";
import { TranslateBlueprintResponse } from "../../../../../../lib/index";

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
  readonly dlcTooltip = dlcTooltip;
  readonly baseGameTooltip = baseGameTooltip;
  readonly dlcLabel = dlcLabel;
  readonly moddedTooltip = moddedTooltip;
  readonly modChipTooltip = modChipTooltip;
  readonly roomTooltip = roomTooltip;
  readonly roomTypeLabel = roomTypeLabel;

  // [] is a fact ("needs no DLC"); absent is not — blueprints saved before
  // requirements were derived must not claim to be base game.
  get isBaseGame(): boolean {
    return this.details?.requiredDlcs?.length === 0;
  }

  private pendingFragment: string | null = null;
  private readonly modTitles = new Map<string, string>();

  constructor(
    private route: ActivatedRoute,
    private location: Location,
    private router: Router,
    private blueprintService: BlueprintService,
    private messageService: MessageService,
    private modsService: ModsService,
    private translationService: TranslationService,
    public authService: AuthenticationService,
  ) {}

  // Only shown when the description's detected language is known and differs
  // from the viewer's own — nearly all traffic (English viewer, English
  // description) never sees the button.
  get showTranslateButton(): boolean {
    const sourceLang = this.details?.sourceLang;
    return (
      sourceLang != null &&
      !this.translationService.matchesViewerLang(sourceLang)
    );
  }

  translating = false;
  translation: TranslateBlueprintResponse | null = null;
  showingTranslation = false;

  translateDescription() {
    if (this.details == null || this.translating) return;
    if (this.translation != null) {
      this.showingTranslation = true;
      return;
    }
    this.translating = true;
    this.translationService.translateBlueprint(this.details.id).subscribe({
      next: (response) => {
        this.translating = false;
        this.translation = response;
        this.showingTranslation = true;
      },
      error: () => {
        this.translating = false;
        this.messageService.add({
          severity: "error",
          summary: $localize`:translateError:Could not translate description`,
        });
      },
    });
  }

  showOriginalDescription() {
    this.showingTranslation = false;
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
    this.modsService.getMods().subscribe({
      next: (mods) => {
        for (const mod of mods) this.modTitles.set(mod.id, mod.title);
      },
      error: () => undefined,
    });

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

  modTitle(id: string): string {
    return this.modTitles.get(id) ?? id;
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
    this.deleteWorking = false;
    this.relatedBlueprints = [];
    this.translation = null;
    this.showingTranslation = false;

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

  // Same URL the in-game mod fetches by id (records its own download counter
  // server-side) — exposed as the button's href so curl/scripts can hit it
  // directly. Anonymous requests 404 on drafts, same as the details page
  // itself, so this only ever works where it's safe to.
  get downloadUrl(): string {
    return this.details == null
      ? ""
      : `/api/getblueprintmod/${this.details.id}`;
  }

  get downloadFileName(): string {
    return this.details == null
      ? ""
      : sanitize(this.details.name) + ".blueprint";
  }

  downloadWorking = false;

  // Intercepted so the browser click still goes through the authenticated
  // client-side export (needed for an owner viewing their own draft, which
  // the plain href above can't reach) — see downloadUrl.
  downloadBlueprint(event: Event) {
    event.preventDefault();
    if (this.details == null || this.downloadWorking) return;
    this.downloadWorking = true;
    this.blueprintService
      .downloadBlueprintFile(this.details.id, this.details.name)
      .pipe(finalize(() => (this.downloadWorking = false)))
      .subscribe({
        error: () => {
          this.messageService.add({
            severity: "error",
            summary: $localize`:downloadError:Could not download blueprint`,
          });
        },
      });
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

  deleteWorking = false;

  // Soft-delete server-side, but there's no undo path exposed to users, so
  // this is presented (confirm copy, redirect away) as permanent.
  deleteBlueprint() {
    if (this.details == null || this.deleteWorking) return;
    const confirmed = window.confirm(
      $localize`:deleteConfirm:Delete "${this.details.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    const details = this.details;
    const returnLink = this.backLink;
    this.deleteWorking = true;
    this.blueprintService
      .deleteBlueprint(details.id)
      .pipe(finalize(() => (this.deleteWorking = false)))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: "success",
            summary: $localize`:deleteToast:${details.name} deleted`,
          });
          this.router.navigate(returnLink);
        },
        error: () => {
          this.messageService.add({
            severity: "error",
            summary: $localize`:deleteError:Could not delete blueprint`,
          });
        },
      });
  }
}
