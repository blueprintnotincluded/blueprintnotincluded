import {
  Directive,
  Output,
  HostListener,
  EventEmitter,
  ElementRef,
} from "@angular/core";
import { Vector2 } from "../../../../../lib/index";

// How far (screen px) a single touch may wander and still count as a tap.
// Fingers never hold a pixel-exact position, so tap detection needs slop;
// past it, the touch commits to a drag and drives the active tool.
const TOUCH_DRAG_SLOP_PX = 8;

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

  // A touch-down is deferred until we know its intent: a second finger makes
  // it a pan/zoom gesture (no tool action at all), movement past the slop
  // makes it a drag (myMouseDown fires then, at the original touch point),
  // and lifting within the slop makes it a tap (down+click+up fire together).
  // Without this, the first finger of an intended pinch already fired the
  // active tool — placing a building the user only meant to zoom past.
  private pendingTouchDown: any = null;

  // After a two-finger gesture ends, a finger still on the screen is inert:
  // it can no longer drag or tap (it was zooming, not aiming), it only
  // hovers. Interaction resumes on the next fresh touch.
  private inertTouchIds: Set<number> = new Set();

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
      // A second finger just touched down: a still-pending first touch is
      // discarded (it was the start of this gesture, not a tap), any
      // committed drag stops here (without registering as a click), and we
      // switch to interpreting further movement as a pan/zoom gesture.
      // stopDrag only fires if a drag actually committed - an uncommitted
      // touch never reached the tool, so there is nothing to stop.
      this.pendingTouchDown = null;
      if (this.isMouseDown[0]) this.stopDrag(event, 0);
      this.gestureActive = true;
      this.primeGestureBaseline();
      if (event.preventDefault) event.preventDefault();
      return;
    }

    if (this.activePointers.size > 2) {
      if (event.preventDefault) event.preventDefault();
      return;
    }

    if (event.pointerType === "touch") {
      this.inertTouchIds.delete(event.pointerId);
      // Touch has no hover state distinct from touching, so synthesize one
      // hover event at touch-down. This drives the build tool's placement
      // preview/validity check before anything commits.
      this.myMouseMove.emit(event);
      // Intent unknown yet — hold the down event, fire nothing else.
      this.pendingTouchDown = event;
      if (event.preventDefault) event.preventDefault();
      return;
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

      // A finger still down after the pinch ends is inert until lifted: it
      // was zooming, not aiming, so letting it drag or tap the active tool
      // would edit the blueprint by accident.
      for (const id of this.activePointers.keys()) this.inertTouchIds.add(id);
      this.isMouseDown[0] = false;
      this.startDragPosition[0] = null;
      this.lastDragPosition[0] = null;
      return;
    }

    if (this.inertTouchIds.delete(event.pointerId)) return;

    if (this.pendingTouchDown?.pointerId === event.pointerId) {
      // The touch never left the slop radius: it's a tap. Fire the full
      // down/click/up sequence a desktop click produces, with the down at
      // the original touch point.
      const down = this.pendingTouchDown;
      this.pendingTouchDown = null;
      if (allowClick) {
        this.myMouseDown.emit(down);
        this.myMouseClick.emit(event);
        this.myMouseUp.emit(event);
        this.stopDrag(event, 0);
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

    if (this.inertTouchIds.has(event.pointerId)) {
      this.myMouseMove.emit(event);
      return;
    }

    if (this.pendingTouchDown?.pointerId === event.pointerId) {
      const moved = Math.hypot(
        event.clientX - this.pendingTouchDown.clientX,
        event.clientY - this.pendingTouchDown.clientY,
      );
      if (moved <= TOUCH_DRAG_SLOP_PX) {
        // Still ambiguous between tap and drag — keep hovering so the
        // placement ghost tracks the finger.
        this.myMouseMove.emit(event);
        return;
      }
      // Left the slop radius: commit to a drag, anchored at the original
      // touch point so the whole movement counts, then let this move flow
      // into the ordinary drag path below.
      const down = this.pendingTouchDown;
      this.pendingTouchDown = null;
      this.myMouseDown.emit(down);
      this.isMouseDown[0] = true;
      this.startDragPosition[0] = new Vector2(down.clientX, down.clientY);
      this.lastDragPosition[0] = new Vector2(down.clientX, down.clientY);
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
    // Multiplicative: the camera scales by the same ratio the finger
    // separation changed by, which is what keeps the content glued to the
    // fingers (an additive px/tile delta felt wildly different at 16 vs 128
    // px/tile, and never matched the finger motion at either).
    event.zoomScale =
      this.gestureLastDistance > 1 ? distance / this.gestureLastDistance : 1;
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
