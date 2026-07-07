import { Component, ViewChild } from "@angular/core";
import { Dialog } from "primeng/dialog";
import { MessageService } from "primeng/api";
import { BlueprintVersionDto } from "../../../../../../../lib/index";
import { BlueprintVersionService } from "../../../services/blueprint-version.service";

@Component({
  selector: "app-version-history-dialog",
  templateUrl: "./version-history-dialog.component.html",
  styleUrls: ["./version-history-dialog.component.css"],
  standalone: false,
})
export class VersionHistoryDialogComponent {
  @ViewChild("versionHistoryDialog", { static: true })
  versionHistoryDialog!: Dialog;

  visible = false;
  loading = false;
  isOwner = false;
  blueprintId!: string;
  versions: BlueprintVersionDto[] = [];
  newVersionName = "";
  busyVersionId: string | null = null;
  creatingVersion = false;

  private requestId = 0;

  constructor(
    private blueprintVersionService: BlueprintVersionService,
    private messageService: MessageService
  ) {}

  showDialog(blueprintId: string, isOwner: boolean) {
    this.blueprintId = blueprintId;
    this.isOwner = isOwner;
    this.newVersionName = "";
    this.visible = true;
    this.load();
  }

  hideDialog() {
    this.visible = false;
  }

  load() {
    this.loading = true;
    const requestId = ++this.requestId;
    this.blueprintVersionService.getVersions(this.blueprintId).subscribe({
      next: (response) => {
        if (requestId !== this.requestId) return;
        this.versions = response.versions;
        this.loading = false;
      },
      error: () => {
        if (requestId !== this.requestId) return;
        this.loading = false;
        this.showError(
          $localize`:versionHistory.loadError:Could not load version history`
        );
      },
    });
  }

  createVersion() {
    if (this.creatingVersion) return;
    const name =
      this.newVersionName.trim().length > 0 ? this.newVersionName.trim() : null;
    this.creatingVersion = true;
    this.blueprintVersionService
      .createVersion(this.blueprintId, name)
      .subscribe({
        next: () => {
          this.creatingVersion = false;
          this.newVersionName = "";
          this.load();
        },
        error: () => {
          this.creatingVersion = false;
          this.showError(
            $localize`:versionHistory.createError:Could not create a version`
          );
        },
      });
  }

  restoreVersion(version: BlueprintVersionDto) {
    this.busyVersionId = version.id;
    this.blueprintVersionService
      .restoreVersion(this.blueprintId, version.id)
      .subscribe({
        next: () => {
          this.busyVersionId = null;
          this.load();
        },
        error: () => {
          this.busyVersionId = null;
          this.showError(
            $localize`:versionHistory.restoreError:Could not restore this version`
          );
        },
      });
  }

  deleteVersion(version: BlueprintVersionDto) {
    const confirmed = window.confirm(
      $localize`:versionHistory.deleteConfirm:Delete this version? This cannot be undone.`
    );
    if (!confirmed) return;

    this.busyVersionId = version.id;
    this.blueprintVersionService
      .deleteVersion(this.blueprintId, version.id)
      .subscribe({
        next: () => {
          this.busyVersionId = null;
          this.load();
        },
        error: (err) => {
          this.busyVersionId = null;
          if (err?.status === 400) {
            this.showError(
              $localize`:versionHistory.lastVersionError:Cannot delete the only remaining version`
            );
          } else {
            this.showError(
              $localize`:versionHistory.deleteError:Could not delete this version`
            );
          }
        },
      });
  }

  private showError(detail: string) {
    this.messageService.add({
      severity: "error",
      summary: $localize`:versionHistory.errorSummary:Version history`,
      detail,
    });
  }
}
