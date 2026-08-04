import { Component, Input } from "@angular/core";
import { BlueprintListItem } from "../../../../../../lib/index";
import {
  baseGameTooltip,
  categoryTooltip,
  dlcTooltip,
  duplicateTooltip,
  moddedTooltip,
  roomTooltip,
} from "../../utils/chip-tooltip";
import { dlcLabel } from "../../../../../../lib/index";
import { roomTypeLabel } from "../../utils/room-labels";
import { ContentLocaleService } from "../../services/content-locale.service";

const MAX_ROOM_CHIPS = 3;

@Component({
  selector: "app-blueprint-card",
  templateUrl: "./blueprint-card.component.html",
  styleUrls: ["./blueprint-card.component.css"],
  standalone: false,
})
export class BlueprintCardComponent {
  @Input() item!: BlueprintListItem;

  /**
   * The title to render. `name` is the authored value and stays the fallback,
   * so a response built without resolution shows the author's own words rather
   * than nothing.
   */
  get title(): string {
    return this.item.displayName ?? this.item.name;
  }

  /**
   * Machine-translation disclosure (spec/search-followups.md §2.7). A card has
   * no room for a second line, so the marker is a glyph and the author's own
   * title is the tooltip — subdued, but the original is never more than a
   * hover (or a tap through to the details page) away. Presenting machine
   * output as the author's words unmarked is the one thing this must not do.
   */
  get translatedTitleTooltip(): string {
    const from = this.localeService.labelFor(this.item.nameSourceLang);
    return from
      ? $localize`Machine-translated from ${from}. Original: ${this.item.name}`
      : $localize`Machine-translated. Original: ${this.item.name}`;
  }

  constructor(private localeService: ContentLocaleService) {}
  @Input() loggedIn = false;
  @Input() showOwner = true;
  /** Router navigation state attached to the details link, e.g. to enable a history-aware back-link. */
  @Input() linkState: Record<string, unknown> | undefined = undefined;

  readonly categoryTooltip = categoryTooltip;
  readonly dlcTooltip = dlcTooltip;
  readonly baseGameTooltip = baseGameTooltip;
  readonly dlcLabel = dlcLabel;
  readonly moddedTooltip = moddedTooltip;
  readonly duplicateTooltip = duplicateTooltip;
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
