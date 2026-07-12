import { Component, Input } from "@angular/core";
import { BlueprintListItem } from "../../../../../../lib/index";
import {
  categoryTooltip,
  gameVersionTooltip,
  moddedTooltip,
  roomTooltip,
} from "../../utils/chip-tooltip";
import { roomTypeLabel } from "../../utils/room-labels";

const MAX_ROOM_CHIPS = 3;

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
  readonly roomTooltip = roomTooltip;
  readonly roomTypeLabel = roomTypeLabel;

  // Cards stay compact: at most 3 room chips, the rest collapse into "+N".
  get visibleRooms(): string[] {
    return (this.item.rooms ?? []).slice(0, MAX_ROOM_CHIPS);
  }

  get hiddenRoomCount(): number {
    return Math.max(0, (this.item.rooms?.length ?? 0) - MAX_ROOM_CHIPS);
  }

  get hiddenRoomsTitle(): string {
    return (this.item.rooms ?? [])
      .slice(MAX_ROOM_CHIPS)
      .map(roomTypeLabel)
      .join(", ");
  }

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
