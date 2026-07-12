import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from "@angular/core";
import {
  PreviewQueueService,
  PreviewQueueTicket,
} from "../services/preview-queue.service";

/**
 * If neither load nor error ever fires (stalled connection, tab throttling),
 * free the slot anyway so one bad request cannot wedge the whole queue.
 */
const LOAD_SAFETY_TIMEOUT_MS = 30_000;

/**
 * Loads a server-rendered preview through PreviewQueueService: the img gets
 * its src only when no earlier preview is still loading, and swaps to the
 * legacy inline thumbnail if the preview request errors. Do not combine with
 * loading="lazy" — a deferred offscreen fetch never fires load and would
 * stall the queue.
 */
@Directive({
  selector: "img[appQueuedPreview]",
  standalone: true,
})
export class QueuedPreviewDirective implements OnChanges, OnDestroy {
  @Input("appQueuedPreview") previewUrl!: string;
  /** Legacy inline thumbnail (data url) used when the preview request errors. */
  @Input() previewFallback: string | null = null;

  private ticket: PreviewQueueTicket | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackApplied = false;

  constructor(
    private element: ElementRef<HTMLImageElement>,
    private queue: PreviewQueueService,
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (!changes["previewUrl"]) return;
    this.releaseSlot();
    this.fallbackApplied = false;
    this.ticket = this.queue.enqueue(() => {
      this.element.nativeElement.src = this.previewUrl;
      this.safetyTimer = setTimeout(
        () => this.releaseSlot(),
        LOAD_SAFETY_TIMEOUT_MS,
      );
    });
  }

  @HostListener("load")
  onLoad() {
    this.releaseSlot();
  }

  @HostListener("error")
  onError() {
    if (this.previewFallback && !this.fallbackApplied) {
      this.fallbackApplied = true;
      this.element.nativeElement.src = this.previewFallback;
    }
    this.releaseSlot();
  }

  ngOnDestroy() {
    this.releaseSlot();
  }

  private releaseSlot() {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    this.ticket?.done();
    this.ticket = null;
  }
}
