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
    this.blueprintVersionService.getVersions(this.blueprintId).subscribe({
      next: (response) => {
        this.versions = response.versions;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  createVersion() {
    const name =
      this.newVersionName.trim().length > 0 ? this.newVersionName.trim() : null;
    this.blueprintVersionService
      .createVersion(this.blueprintId, name)
      .subscribe({
        next: () => {
          this.newVersionName = "";
          this.load();
        },
        error: () =>
          this.showError(
            $localize`:versionHistory.createError:Could not create a version`
          ),
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
