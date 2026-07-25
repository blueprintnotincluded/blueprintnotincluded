import { Component, Input } from "@angular/core";
import { BlueprintListItem } from "../../../../../../lib/index";
import {
  baseGameTooltip,
  categoryTooltip,
  dlcTooltip,
  moddedTooltip,
  roomTooltip,
} from "../../utils/chip-tooltip";
import { dlcLabel } from "../../../../../../lib/index";
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
  readonly dlcTooltip = dlcTooltip;
  readonly baseGameTooltip = baseGameTooltip;
  readonly dlcLabel = dlcLabel;
  readonly moddedTooltip = moddedTooltip;
  readonly roomTooltip = roomTooltip;
  readonly roomTypeLabel = roomTypeLabel;

  // [] is a fact ("needs no DLC"); absent is not — blueprints saved before
  // requirements were derived must not claim to be base game.
  get isBaseGame(): boolean {
    return this.item.requiredDlcs?.length === 0;
  }

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

  // Fallback img src for when the preview request errors: the stored
  // save-time thumbnail. List responses carry the 'real' sentinel instead of
  // inlining the image, so the fallback is a URL, not a data URI.
  thumbnailFallbackUrl(): string | null {
    if (this.item.thumbnail !== "real") return null;
    const version = this.item.modifiedAt
      ? new Date(this.item.modifiedAt).getTime()
      : 0;
    return `/api/blueprints/${this.item.id}/thumbnail?v=${version}`;
  }
}
