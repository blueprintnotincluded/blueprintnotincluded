import { ElementRef } from "@angular/core";
import { DragAndDropDirective } from "./draganddrop.directive";

let nextPointerId = 1;

const pointerEvent = (
  button: number,
  clientX: number,
  clientY: number,
  opts: { pointerType?: string; pointerId?: number } = {},
) =>
  ({
    button,
    clientX,
    clientY,
    pointerId: opts.pointerId ?? nextPointerId++,
    pointerType: opts.pointerType ?? "mouse",
    preventDefault: vi.fn(),
  }) as any;

const fakeElementRef = () =>
  ({
    nativeElement: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  }) as unknown as ElementRef;

describe("DragAndDropDirective", () => {
  let dir: DragAndDropDirective;

  beforeEach(() => {
    nextPointerId = 1;
    dir = new DragAndDropDirective(fakeElementRef());
  });

  describe("initial state", () => {
    it("starts with all buttons not pressed", () => {
      expect(dir.isMouseDown[0]).toBe(false);
      expect(dir.isMouseDown[1]).toBe(false);
      expect(dir.isMouseDown[2]).toBe(false);
    });
  });

  describe("onPointerDown", () => {
    it("sets isMouseDown[button] to true", () => {
      dir.onPointerDown(pointerEvent(0, 10, 20));
      expect(dir.isMouseDown[0]).toBe(true);
    });

    it("emits myMouseDown", () => {
      const handler = vi.fn();
      dir.myMouseDown.subscribe(handler);
      dir.onPointerDown(pointerEvent(0, 10, 20));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not emit again if mouse is already down", () => {
      const handler = vi.fn();
      dir.myMouseDown.subscribe(handler);
      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerId: id }));
      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerId: id })); // duplicate
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("tracks different buttons independently for a single physical mouse (one pointerId, multiple buttons)", () => {
      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerId: id }));
      dir.onPointerDown(pointerEvent(2, 10, 20, { pointerId: id }));
      expect(dir.isMouseDown[0]).toBe(true);
      expect(dir.isMouseDown[2]).toBe(true);
    });

    it("synthesizes a myMouseMove before myMouseDown for touch, to drive hover/preview state on tap", () => {
      const calls: string[] = [];
      dir.myMouseMove.subscribe(() => calls.push("move"));
      dir.myMouseDown.subscribe(() => calls.push("down"));

      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerType: "touch" }));

      expect(calls).toEqual(["move", "down"]);
    });

    it("does not synthesize myMouseMove for a real mouse press", () => {
      const handler = vi.fn();
      dir.myMouseMove.subscribe(handler);
      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerType: "mouse" }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("onPointerUp", () => {
    it("emits myMouseClick when position matches startDragPosition", () => {
      const clickHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);

      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 50, 60, { pointerId: id }));
      dir.onPointerUp(pointerEvent(0, 50, 60, { pointerId: id })); // same position = click
      expect(clickHandler).toHaveBeenCalledTimes(1);
    });

    it("does not emit myMouseClick when position differs (drag)", () => {
      const clickHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);

      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 50, 60, { pointerId: id }));
      dir.onPointerUp(pointerEvent(0, 80, 90, { pointerId: id })); // moved = no click
      expect(clickHandler).not.toHaveBeenCalled();
    });

    it("emits myMouseUp", () => {
      const handler = vi.fn();
      dir.myMouseUp.subscribe(handler);
      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 0, 0, { pointerId: id }));
      dir.onPointerUp(pointerEvent(0, 0, 0, { pointerId: id }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("sets isMouseDown[button] to false", () => {
      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 0, 0, { pointerId: id }));
      dir.onPointerUp(pointerEvent(0, 0, 0, { pointerId: id }));
      expect(dir.isMouseDown[0]).toBe(false);
    });

    it("emits myMouseStopDrag on pointer up", () => {
      const handler = vi.fn();
      dir.myMouseStopDrag.subscribe(handler);
      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 0, 0, { pointerId: id }));
      dir.onPointerUp(pointerEvent(0, 5, 5, { pointerId: id }));
      expect(handler).toHaveBeenCalled();
    });

    it("a tap (touch down+up at same tile) fires a click, matching the tap-to-place flow", () => {
      const clickHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);

      const id = nextPointerId++;
      dir.onPointerDown(
        pointerEvent(0, 30, 40, { pointerId: id, pointerType: "touch" }),
      );
      dir.onPointerUp(
        pointerEvent(0, 30, 40, { pointerId: id, pointerType: "touch" }),
      );

      expect(clickHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("onPointerLeave", () => {
    it("emits myMouseOut for a real mouse", () => {
      const handler = vi.fn();
      dir.myMouseOut.subscribe(handler);
      dir.onPointerLeave(pointerEvent(0, 0, 0, { pointerType: "mouse" }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("clears all drag states on leave", () => {
      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerId: id }));
      dir.onPointerDown(pointerEvent(2, 10, 20, { pointerId: id }));
      dir.onPointerLeave(pointerEvent(0, 0, 0, { pointerType: "mouse" }));
      expect(dir.isMouseDown[0]).toBe(false);
      expect(dir.isMouseDown[2]).toBe(false);
    });

    it("is ignored for touch, since a finger lifting is a pointerup/cancel, not a leave", () => {
      const handler = vi.fn();
      dir.myMouseOut.subscribe(handler);
      dir.onPointerLeave(pointerEvent(0, 0, 0, { pointerType: "touch" }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("onContextMenu", () => {
    it("returns false to suppress the context menu", () => {
      expect(dir.onContextMenu({})).toBe(false);
    });
  });

  describe("onPointerMove", () => {
    it("emits myMouseMove when not dragging", () => {
      const handler = vi.fn();
      dir.myMouseMove.subscribe(handler);
      dir.onPointerMove(pointerEvent(0, 5, 5));
      expect(handler).toHaveBeenCalled();
    });

    it("emits myMouseDrag (not myMouseMove) while dragging", () => {
      const moveHandler = vi.fn();
      const dragHandler = vi.fn();
      dir.myMouseMove.subscribe(moveHandler);
      dir.myMouseDrag.subscribe(dragHandler);

      const id = nextPointerId++;
      dir.onPointerDown(pointerEvent(0, 10, 20, { pointerId: id }));
      dir.onPointerMove(pointerEvent(0, 15, 25, { pointerId: id }));

      expect(dragHandler).toHaveBeenCalled();
      expect(moveHandler).not.toHaveBeenCalled();
    });
  });

  describe("two-finger touch gesture", () => {
    it("stops any single-finger drag (without a click) once a second finger touches down", () => {
      const clickHandler = vi.fn();
      const stopDragHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);
      dir.myMouseStopDrag.subscribe(stopDragHandler);

      dir.onPointerDown(
        pointerEvent(0, 10, 10, { pointerId: 1, pointerType: "touch" }),
      );
      dir.onPointerDown(
        pointerEvent(0, 50, 10, { pointerId: 2, pointerType: "touch" }),
      );

      expect(stopDragHandler).toHaveBeenCalled();
      expect(clickHandler).not.toHaveBeenCalled();
      expect(dir.isMouseDown[0]).toBe(false);
    });

    it("emits myMultiTouchGesture with pan and zoom deltas as the two fingers move", () => {
      const gestureHandler = vi.fn();
      dir.myMultiTouchGesture.subscribe(gestureHandler);

      dir.onPointerDown(
        pointerEvent(0, 0, 0, { pointerId: 1, pointerType: "touch" }),
      );
      dir.onPointerDown(
        pointerEvent(0, 100, 0, { pointerId: 2, pointerType: "touch" }),
      );

      // Fingers spread apart and both shift right -> pan right, zoom in.
      dir.onPointerMove(
        pointerEvent(0, 10, 0, { pointerId: 1, pointerType: "touch" }),
      );
      dir.onPointerMove(
        pointerEvent(0, 130, 0, { pointerId: 2, pointerType: "touch" }),
      );

      expect(gestureHandler).toHaveBeenCalled();
      const lastEvent = gestureHandler.mock.calls.at(-1)![0];
      expect(lastEvent.panX).toBeGreaterThan(0);
      expect(lastEvent.zoomDelta).toBeGreaterThan(0);
    });

    it("does not emit myMouseClick/myMouseUp for a finger lifted while gesturing", () => {
      const clickHandler = vi.fn();
      const upHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);
      dir.myMouseUp.subscribe(upHandler);

      dir.onPointerDown(
        pointerEvent(0, 0, 0, { pointerId: 1, pointerType: "touch" }),
      );
      dir.onPointerDown(
        pointerEvent(0, 100, 0, { pointerId: 2, pointerType: "touch" }),
      );
      dir.onPointerUp(
        pointerEvent(0, 0, 0, { pointerId: 1, pointerType: "touch" }),
      );

      expect(clickHandler).not.toHaveBeenCalled();
      expect(upHandler).not.toHaveBeenCalled();
    });

    it("lets the user keep dragging with the remaining finger after the pinch ends", () => {
      dir.onPointerDown(
        pointerEvent(0, 0, 0, { pointerId: 1, pointerType: "touch" }),
      );
      dir.onPointerDown(
        pointerEvent(0, 100, 0, { pointerId: 2, pointerType: "touch" }),
      );
      dir.onPointerUp(
        pointerEvent(0, 100, 0, { pointerId: 2, pointerType: "touch" }),
      );

      expect(dir.isMouseDown[0]).toBe(true);

      const dragHandler = vi.fn();
      dir.myMouseDrag.subscribe(dragHandler);
      dir.onPointerMove(
        pointerEvent(0, 20, 0, { pointerId: 1, pointerType: "touch" }),
      );
      expect(dragHandler).toHaveBeenCalled();
    });
  });
});
