import { Component, Input } from "@angular/core";
import { BlueprintService } from "../../../services/blueprint-service";
import { MessageService } from "primeng/api";

@Component({
  selector: "app-dialog-share-url",
  templateUrl: "./dialog-share-url.component.html",
  styleUrls: ["./dialog-share-url.component.css"],
  standalone: false,
})
export class DialogShareUrlComponent {
  /** When set (e.g. from the details page), used instead of the editor-scoped BlueprintService.id. */
  @Input() blueprintId?: string;
  /** Used to prefill the Reddit share title; falls back to a generic title when unset. */
  @Input() blueprintName?: string;

  visible: boolean = false;

  constructor(
    public blueprintService: BlueprintService,
    private messageService: MessageService
  ) {}

  private get id(): string | null {
    return this.blueprintId ?? this.blueprintService.id;
  }

  get url() {
    return this.id != null ? BlueprintService.baseUrl + "/b/" + this.id : "";
  }

  showDialog() {
    this.visible = true;
  }

  hideDialog() {
    this.visible = false;
  }

  copyToClipboard(inputElement: HTMLInputElement) {
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

  get redditShareUrl(): string {
    const title =
      this.blueprintName ??
      $localize`Check out my Oxygen Not Included blueprint`;
    const params = new URLSearchParams({ url: this.url, title });
    return "https://www.reddit.com/submit?" + params.toString();
  }

  shareToReddit() {
    window.open(this.redditShareUrl, Math.random().toString(36));
  }
}
