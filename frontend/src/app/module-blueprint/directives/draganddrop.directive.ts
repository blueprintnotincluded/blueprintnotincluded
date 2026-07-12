import {
  Directive,
  Output,
  HostListener,
  EventEmitter,
  ElementRef,
} from "@angular/core";
import { Vector2 } from "../../../../../lib/index";

// How much a two-finger pinch (in screen px of finger separation) changes
// CameraService.currentZoom (in px/tile). Lower = less sensitive pinch.
const PINCH_ZOOM_SENSITIVITY = 0.5;

@Directive({
  selector: "[appDragAndDrop]",
  standalone: false,
})
export class DragAndDropDirective {
  @Output() myMouseUp = new EventEmitter();
  @Output() myMouseDown = new EventEmitter();
  @Output() myMouseOut = new EventEmitter();
  @Output() myMouseDrag = new EventEmitter();
  @Output() myMouseStopDrag = new EventEmitter();
  @Output() myMouseMove = new EventEmitter();
  @Output() myMouseClick = new EventEmitter();
  // Two-finger touch gesture: pans and zooms the camera at once.
  @Output() myMultiTouchGesture = new EventEmitter();

  isMouseDown: boolean[];
  lastDragPosition: (Vector2 | null)[];
  startDragPosition: (Vector2 | null)[];

  // Pointer Events let one code path drive mouse, touch and pen. A single
  // active pointer is treated exactly like the old single mouse button
  // (button index 0 for touch, since touch has no button concept). A second
  // simultaneous pointer switches into a two-finger pan/zoom gesture instead.
  private activePointers: Map<number, Vector2> = new Map();
  private gestureActive: boolean = false;
  private gestureLastDistance: number = 0;
  private gestureLastMidpoint: Vector2 | null = null;

  constructor(private el: ElementRef) {
    this.isMouseDown = [];
    this.lastDragPosition = [];
    this.startDragPosition = [];

    for (let i = 0; i <= 2; i++) {
      this.isMouseDown[i] = false;
    }
  }

  @HostListener("pointerdown", ["$event"]) onPointerDown(event: any) {
    this.activePointers.set(
      event.pointerId,
      new Vector2(event.clientX, event.clientY),
    );

    if (event.pointerType) {
      try {
        this.el.nativeElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore - capture is a best-effort reliability improvement.
      }
    }

    if (this.activePointers.size == 2) {
      // A second finger just touched down: whatever single-pointer drag was
      // in progress stops here (without registering as a click), and we
      // switch to interpreting further movement as a pan/zoom gesture.
      this.stopDrag(event, 0);
      this.gestureActive = true;
      this.primeGestureBaseline();
      if (event.preventDefault) event.preventDefault();
      return;
    }

    if (this.activePointers.size > 2) {
      if (event.preventDefault) event.preventDefault();
      return;
    }

    // Touch has no hover state distinct from touching, so synthesize one
    // hover event at touch-down. This drives the build tool's placement
    // preview/validity check before the matching touch-up fires the tap.
    if (event.pointerType === "touch") {
      this.myMouseMove.emit(event);
    }

    const dragButton: number = event.button;
    if (!this.isMouseDown[dragButton]) {
      this.myMouseDown.emit(event);
      this.isMouseDown[dragButton] = true;
      this.startDragPosition[dragButton] = new Vector2(
        event.clientX,
        event.clientY,
      );
      this.lastDragPosition[dragButton] = new Vector2(
        event.clientX,
        event.clientY,
      );
    }

    if (event.preventDefault) {
      event.preventDefault();
    }
  }

  @HostListener("pointerup", ["$event"]) onPointerUp(event: any) {
    this.onPointerEnd(event, true);
  }

  @HostListener("pointercancel", ["$event"]) onPointerCancel(event: any) {
    this.onPointerEnd(event, false);
  }

  private onPointerEnd(event: any, allowClick: boolean) {
    this.activePointers.delete(event.pointerId);

    if (this.gestureActive) {
      if (this.activePointers.size >= 2) {
        this.primeGestureBaseline();
        return;
      }

      this.gestureActive = false;
      this.gestureLastMidpoint = null;

      if (this.activePointers.size == 1) {
        // One finger is still down after the pinch ends: let the user keep
        // dragging with it, but re-baseline drag tracking to that finger's
        // current position so it doesn't jump.
        const remaining = this.activePointers.values().next().value as Vector2;
        this.isMouseDown[0] = true;
        this.startDragPosition[0] = new Vector2(remaining.x, remaining.y);
        this.lastDragPosition[0] = new Vector2(remaining.x, remaining.y);
      } else {
        this.isMouseDown[0] = false;
        this.startDragPosition[0] = null;
        this.lastDragPosition[0] = null;
      }
      return;
    }

    const dragButton: number = event.button;

    if (
      allowClick &&
      this.startDragPosition[dragButton] != null &&
      new Vector2(event.clientX, event.clientY).equals(
        this.startDragPosition[dragButton]!,
      )
    )
      this.myMouseClick.emit(event);

    this.myMouseUp.emit(event);

    this.stopDrag(event, dragButton);
  }

  @HostListener("contextmenu", ["$event"]) onContextMenu(_event: any) {
    // Comment this to get context on canvas
    return false;
  }

  @HostListener("pointerleave", ["$event"]) onPointerLeave(event: any) {
    if (event.pointerType !== "mouse") return;
    for (let i = 0; i <= 2; i++) this.stopDrag(event, i);
    this.myMouseOut.emit(event);
  }

  @HostListener("pointermove.out-zone", ["$event"]) onPointerMove(event: any) {
    if (this.activePointers.has(event.pointerId))
      this.activePointers.set(
        event.pointerId,
        new Vector2(event.clientX, event.clientY),
      );

    if (this.gestureActive) {
      this.handleGestureMove(event);
      return;
    }

    let isDragging = false;
    for (let i = 0; i <= 2; i++) if (this.isMouseDown[i]) isDragging = true;

    if (isDragging) {
      for (let i = 0; i <= 2; i++)
        if (this.isMouseDown[i]) {
          event.dragX = event.clientX - this.lastDragPosition[i]!.x;
          event.dragY = event.clientY - this.lastDragPosition[i]!.y;
          event.dragButton = this.isMouseDown;

          this.lastDragPosition[i]!.x = event.clientX;
          this.lastDragPosition[i]!.y = event.clientY;
        }
      this.myMouseDrag.emit(event);
    } else {
      this.myMouseMove.emit(event);
    }
  }

  private static pointerDistance(a: Vector2, b: Vector2): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private primeGestureBaseline() {
    const points = Array.from(this.activePointers.values());
    if (points.length < 2) return;

    this.gestureLastDistance = DragAndDropDirective.pointerDistance(
      points[0],
      points[1],
    );
    this.gestureLastMidpoint = new Vector2(
      (points[0].x + points[1].x) / 2,
      (points[0].y + points[1].y) / 2,
    );
  }

  private handleGestureMove(event: any) {
    const points = Array.from(this.activePointers.values());
    if (points.length < 2 || this.gestureLastMidpoint == null) return;

    const distance = DragAndDropDirective.pointerDistance(points[0], points[1]);
    const midpoint = new Vector2(
      (points[0].x + points[1].x) / 2,
      (points[0].y + points[1].y) / 2,
    );

    event.panX = midpoint.x - this.gestureLastMidpoint.x;
    event.panY = midpoint.y - this.gestureLastMidpoint.y;
    event.zoomDelta =
      (distance - this.gestureLastDistance) * PINCH_ZOOM_SENSITIVITY;
    event.centerClientX = midpoint.x;
    event.centerClientY = midpoint.y;

    this.gestureLastDistance = distance;
    this.gestureLastMidpoint = midpoint;

    this.myMultiTouchGesture.emit(event);
  }

  stopDrag(event: any, i: number) {
    this.isMouseDown[i] = false;
    this.startDragPosition[i] = null;
    this.lastDragPosition[i] = null;

    this.myMouseStopDrag.emit(event);
  }
}
