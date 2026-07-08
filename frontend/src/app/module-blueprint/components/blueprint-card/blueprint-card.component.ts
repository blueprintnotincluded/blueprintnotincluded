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

  isReal(thumbnail: string): boolean {
    return thumbnail !== "svg" && thumbnail !== "svg_nothing";
  }
}
