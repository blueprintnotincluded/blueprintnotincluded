import {
  AfterViewInit,
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
} from "@angular/core";

/**
 * Replaces the per-tab static underline with a single "ink" bar that slides
 * between tabs. The host container gets `has-tab-ink` (CSS hides the static
 * active underline) and an absolutely-positioned `.bni-tab-ink` span that is
 * moved under whichever child currently carries `.active`. Class flips are
 * tracked with a MutationObserver and layout shifts (font load, wrap,
 * resize) with a ResizeObserver, so no inputs are needed.
 */
@Directive({
  selector: "[appTabInk]",
  standalone: true,
})
export class TabInkDirective implements AfterViewInit, OnDestroy {
  private ink: HTMLElement | null = null;
  private classObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private element: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {}

  ngAfterViewInit() {
    const host = this.element.nativeElement;
    host.classList.add("has-tab-ink");

    this.ink = host.ownerDocument.createElement("span");
    this.ink.className = "bni-tab-ink";
    this.ink.setAttribute("aria-hidden", "true");
    host.appendChild(this.ink);

    this.zone.runOutsideAngular(() => {
      // ignore mutations on the ink itself: classList/style writes re-set the
      // attribute even when unchanged, which would refire this observer and
      // loop reposition forever
      this.classObserver = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.target !== this.ink)) this.reposition();
      });
      // childList: tabs added/removed dynamically (*ngFor/*ngIf) must also
      // reposition the bar; the ink is appended before observing and
      // reposition never touches the child list, so this cannot self-fire
      this.classObserver.observe(host, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.reposition());
        this.resizeObserver.observe(host);
      }
      this.reposition();
    });
  }

  ngOnDestroy() {
    this.classObserver?.disconnect();
    this.resizeObserver?.disconnect();
  }

  private reposition() {
    const host = this.element.nativeElement;
    const active = host.querySelector<HTMLElement>("button.active");
    if (!this.ink) return;
    if (!active || active.offsetWidth === 0) {
      // no active tab (or container hidden): keep the bar invisible so it
      // doesn't strand at a stale position
      if (this.ink.classList.contains("bni-tab-ink--ready"))
        this.ink.classList.remove("bni-tab-ink--ready");
      return;
    }
    // top is computed from the button (not container bottom) so the bar
    // follows the active tab onto its own row when the flex row wraps.
    // Every write below is guarded: unconditional writes re-set attributes
    // even when the value is unchanged, refiring the observers in a loop.
    const top = active.offsetTop + active.offsetHeight - 2;
    const width = `${active.offsetWidth}px`;
    const transform = `translate(${active.offsetLeft}px, ${top}px)`;
    if (this.ink.style.width !== width) this.ink.style.width = width;
    if (this.ink.style.transform !== transform)
      this.ink.style.transform = transform;
    // --ready lands in the same style flush as the first position write, so
    // the bar appears in place; only subsequent moves animate
    if (!this.ink.classList.contains("bni-tab-ink--ready"))
      this.ink.classList.add("bni-tab-ink--ready");
  }
}
