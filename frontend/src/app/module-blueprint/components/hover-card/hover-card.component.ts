import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
} from "@angular/core";
import {
  HoverCardService,
  HoverCardView,
} from "../../services/hover-card.service";
import { placeHoverCard } from "./hover-card-placement";

// The game's hover card: one small card for each thing on the hovered cell,
// top to bottom, so what a building hides is still readable. Mounted once
// over the canvas by the blueprint parent; HoverCardService says what to show.
//
// Renders itself with a local detectChanges: pointer moves arrive outside
// Angular's zone, and a whole-app change detection on every tile the pointer
// crosses would cost far more than this card does.
@Component({
  selector: "app-hover-card",
  templateUrl: "./hover-card.component.html",
  styleUrls: ["./hover-card.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class HoverCardComponent implements OnInit, OnDestroy {
  view: HoverCardView | null = null;

  private disconnect: (() => void) | null = null;

  constructor(
    private hoverCardService: HoverCardService,
    private changeDetector: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit() {
    this.disconnect = this.hoverCardService.connect((view) =>
      this.render(view),
    );
  }

  ngOnDestroy() {
    this.disconnect?.();
  }

  render(view: HoverCardView | null) {
    this.view = view;
    this.changeDetector.detectChanges();
    if (view == null) return;

    // Measured after rendering, so the edge flip knows the card's real size.
    const element = this.host.nativeElement;
    const placed = placeHoverCard(
      view.cellRect,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    element.style.transform = `translate(${placed.left}px, ${placed.top}px)`;
  }
}
