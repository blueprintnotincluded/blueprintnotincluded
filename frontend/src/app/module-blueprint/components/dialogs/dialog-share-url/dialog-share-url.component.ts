import { Component, OnInit, Input } from "@angular/core";
import { BlueprintService } from "../../../services/blueprint-service";
import { MessageService } from "primeng/api";

@Component({
  selector: "app-dialog-share-url",
  templateUrl: "./dialog-share-url.component.html",
  styleUrls: ["./dialog-share-url.component.css"],
  
})
export class DialogShareUrlComponent {
  visible: boolean = false;

  constructor(
    public blueprintService: BlueprintService,
    private messageService: MessageService
  ) {}

  get url() {
    return this.blueprintService.id != null
      ? BlueprintService.baseUrl + "/b/" + this.blueprintService.id
      : "";
  }

  showDialog() {
    this.visible = true;
  }

  hideDialog() {
    this.visible = false;
  }

  copyToClipboard(inputElement) {
    inputElement.select();
    document.execCommand("copy");
    this.messageService.add({
      severity: "success",
      summary: $localize`Shareable url copied`,
      detail: $localize`Paste it into a new tab to try it!`,
    });
    this.hideDialog();
  }

  newTab() {
    window.open(this.url, Math.random().toString(36));
  }
}
