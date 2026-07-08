import { Component, Input } from "@angular/core";
import { BlueprintListItem } from "../../../../../../lib/index";
import {
  categoryTooltip,
  gameVersionTooltip,
  moddedTooltip,
} from "../../utils/chip-tooltip";

@Component({
  selector: "app-blueprint-card",
  templateUrl: "./blueprint-card.component.html",
  styleUrls: ["./blueprint-card.component.css"],
  standalone: false,
})
export class BlueprintCardComponent {
  @Input() item!: BlueprintListItem;
  @Input() loggedIn = false;
  @Input() showOwner = true;
  /** Router navigation state attached to the details link, e.g. to enable a history-aware back-link. */
  @Input() linkState: Record<string, unknown> | undefined = undefined;

  readonly categoryTooltip = categoryTooltip;
  readonly gameVersionTooltip = gameVersionTooltip;
  readonly moddedTooltip = moddedTooltip;

  /** Falls back to the legacy inline thumbnail when the server render 404s/errors. */
  previewFailed = false;

  isReal(thumbnail: string): boolean {
    return thumbnail !== "svg" && thumbnail !== "svg_nothing";
  }

  cardPreviewUrl(): string {
    const version = this.item.modifiedAt
      ? new Date(this.item.modifiedAt).getTime()
      : 0;
    return `/api/blueprints/${this.item.id}/preview/card.webp?v=${version}`;
  }
}
