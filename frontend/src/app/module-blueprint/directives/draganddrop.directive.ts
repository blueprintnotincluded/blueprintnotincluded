import {
  Directive,
  Output,
  HostListener,
  EventEmitter,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { Vector2 } from "../../../../../lib/index";

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

  isMouseDown: boolean[];
  lastDragPosition: Vector2[];
  startDragPosition: Vector2[];

  constructor() {
    this.isMouseDown = [];
    this.lastDragPosition = [];
    this.startDragPosition = [];

    for (let i = 0; i <= 2; i++) {
      this.isMouseDown[i] = false;
    }
  }

  @HostListener("mousedown", ["$event"]) onMouseDown(event: any) {
    var event = window.event || event; // old IE support

    let dragButton: number = event.button;
    if (!this.isMouseDown[dragButton]) {
      this.myMouseDown.emit(event);
      this.isMouseDown[dragButton] = true;
      this.startDragPosition[dragButton] = new Vector2(
        event.clientX,
        event.clientY
      );
      this.lastDragPosition[dragButton] = new Vector2(
        event.clientX,
        event.clientY
      );
    }

    if (event.preventDefault) {
      event.preventDefault();
    }
  }

  @HostListener("mouseup", ["$event"]) onMouseUp(event: any) {
    var event = window.event || event; // old IE support

    let dragButton: number = event.button;

    // Emit a mouseclick if the mouse hasn't moved since mousedown
    if (
      new Vector2(event.clientX, event.clientY).equals(
        this.startDragPosition[dragButton]
      )
    )
      this.myMouseClick.emit(event);

    this.myMouseUp.emit(event);

    this.stopDrag(event, dragButton);
  }

  @HostListener("contextmenu", ["$event"]) onContextMenu(event: any) {
    // Comment this to get context on canvas
    return false;
  }

  @HostListener("mouseout", ["$event"]) onMouseLeave(event: any) {
    for (let i = 0; i <= 2; i++) this.stopDrag(event, i);
    this.myMouseOut.emit(event);
  }

  @HostListener("mousemove.out-zone", ["$event"]) onMouseMove(event: any) {
    var event = window.event || event; // old IE support

    let isDragging = false;
    for (let i = 0; i <= 2; i++) if (this.isMouseDown[i]) isDragging = true;

    if (isDragging) {
      for (let i = 0; i <= 2; i++)
        if (this.isMouseDown[i]) {
          event.dragX = event.clientX - this.lastDragPosition[i].x;
          event.dragY = event.clientY - this.lastDragPosition[i].y;
          event.dragButton = this.isMouseDown;

          this.lastDragPosition[i].x = event.clientX;
          this.lastDragPosition[i].y = event.clientY;
        }
      this.myMouseDrag.emit(event);
    } else {
      this.myMouseMove.emit(event);
    }
  }

  stopDrag(event: any, i: number) {
    this.isMouseDown[i] = false;
    this.startDragPosition[i] = null;
    this.lastDragPosition[i] = null;

    this.myMouseStopDrag.emit(event);
  }
}
