import { Directive, Output, HostListener, EventEmitter } from "@angular/core";

@Directive({
  selector: "[appMouseWheel]",
  standalone: false,
})
export class MouseWheelDirective {
  @Output() mouseWheelUp = new EventEmitter();
  @Output() mouseWheelDown = new EventEmitter();
  @Output() mouseWheel = new EventEmitter();

  @HostListener("mousewheel.out-zone", ["$event"]) onMouseWheelChrome(
    event: any,
  ) {
    this.mouseWheelFunc(event);
  }

  @HostListener("DOMMouseScroll.out-zone", ["$event"]) onMouseWheelFirefox(
    event: any,
  ) {
    this.mouseWheelFunc(event);
  }

  @HostListener("onmousewheel.out-zone", ["$event"]) onMouseWheelIE(
    event: any,
  ) {
    this.mouseWheelFunc(event);
  }

  mouseWheelFunc(event: any) {
    event = window.event || event; // old IE support
    const delta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail));
    event.delta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail));
    if (delta != 0) this.mouseWheel.emit(event);
    if (delta > 0) {
      this.mouseWheelUp.emit(event);
    } else if (delta < 0) {
      this.mouseWheelDown.emit(event);
    }
    // for IE
    event.returnValue = false;
    // for Chrome and Firefox
    if (event.preventDefault) {
      event.preventDefault();
    }
  }
}
