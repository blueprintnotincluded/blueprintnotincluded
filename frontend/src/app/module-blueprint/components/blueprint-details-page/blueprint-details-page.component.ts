import { Component, OnInit, ViewChild } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { EMPTY, Observable } from "rxjs";
import { catchError, switchMap } from "rxjs/operators";
import { BlueprintDetailsResponse } from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";
import { VersionHistoryDialogComponent } from "../dialogs/version-history-dialog/version-history-dialog.component";

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

  constructor(
    private route: ActivatedRoute,
    private blueprintService: BlueprintService,
    public authService: AuthenticationService
  ) {}

  get nbForksString() {
    const nbForks = this.details?.nbForks ?? 0;
    return $localize`fork${nbForks !== 1 ? "s" : ""}`;
  }

  ngOnInit() {
    this.route.paramMap
      .pipe(switchMap((params) => this.load(params.get("id"))))
      .subscribe((details) => {
        if (details == null) return;
        this.details = details;
        this.blueprintId = details.id;
        this.loading = false;
      });
  }

  private load(id: string | null): Observable<BlueprintDetailsResponse | null> {
    this.details = null;
    this.blueprintId = null;
    this.notFound = false;
    this.loadError = false;

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

  openVersionHistory() {
    if (this.details == null) return;
    this.versionHistoryDialog.showDialog(
      this.details.id,
      this.details.ownedByMe
    );
  }
}
