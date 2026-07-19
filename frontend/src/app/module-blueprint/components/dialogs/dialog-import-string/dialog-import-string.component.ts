import { Component } from "@angular/core";
import { BlueprintService } from "../../../services/blueprint-service";
import { MessageService } from "primeng/api";

// Paste-import for the BlueprintsV2 mod's copy-to-clipboard share-string
// (also accepts raw .blueprint JSON, mirroring the mod's tolerant import).
@Component({
  selector: "app-dialog-import-string",
  templateUrl: "./dialog-import-string.component.html",
  styleUrls: ["./dialog-import-string.component.css"],
  standalone: false,
})
export class DialogImportStringComponent {
  visible: boolean = false;
  blueprintText: string = "";

  constructor(
    private blueprintService: BlueprintService,
    private messageService: MessageService,
  ) {}

  showDialog() {
    this.blueprintText = "";
    this.visible = true;
  }

  hideDialog() {
    this.visible = false;
  }

  get canImport(): boolean {
    return this.blueprintText.trim().length > 0;
  }

  import() {
    const text = this.blueprintText.trim();
    if (text.length === 0) return;

    this.blueprintService
      .openBlueprintFromShareString(text)
      .then(() => this.hideDialog())
      .catch(() => {
        this.messageService.add({
          severity: "error",
          summary: $localize`Could not import blueprint`,
          detail: $localize`The pasted text is not a valid blueprint share string or .blueprint file content`,
        });
      });
  }
}
