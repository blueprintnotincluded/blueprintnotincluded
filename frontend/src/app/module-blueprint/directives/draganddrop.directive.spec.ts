import { DragAndDropDirective } from "./draganddrop.directive";

const mouseEvent = (
  _type: string,
  button: number,
  clientX: number,
  clientY: number
) =>
  ({
    button,
    clientX,
    clientY,
    preventDefault: vi.fn(),
  } as any);

describe("DragAndDropDirective", () => {
  let dir: DragAndDropDirective;

  beforeEach(() => {
    dir = new DragAndDropDirective();
  });

  describe("initial state", () => {
    it("starts with all buttons not pressed", () => {
      expect(dir.isMouseDown[0]).toBe(false);
      expect(dir.isMouseDown[1]).toBe(false);
      expect(dir.isMouseDown[2]).toBe(false);
    });
  });

  describe("onMouseDown", () => {
    it("sets isMouseDown[button] to true", () => {
      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20));
      expect(dir.isMouseDown[0]).toBe(true);
    });

    it("emits myMouseDown", () => {
      const handler = vi.fn();
      dir.myMouseDown.subscribe(handler);
      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not emit again if mouse is already down", () => {
      const handler = vi.fn();
      dir.myMouseDown.subscribe(handler);
      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20));
      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20)); // duplicate
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("tracks different buttons independently", () => {
      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20));
      dir.onMouseDown(mouseEvent("mousedown", 2, 10, 20));
      expect(dir.isMouseDown[0]).toBe(true);
      expect(dir.isMouseDown[2]).toBe(true);
    });
  });

  describe("onMouseUp", () => {
    it("emits myMouseClick when position matches startDragPosition", () => {
      const clickHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);

      dir.onMouseDown(mouseEvent("mousedown", 0, 50, 60));
      dir.onMouseUp(mouseEvent("mouseup", 0, 50, 60)); // same position = click
      expect(clickHandler).toHaveBeenCalledTimes(1);
    });

    it("does not emit myMouseClick when position differs (drag)", () => {
      const clickHandler = vi.fn();
      dir.myMouseClick.subscribe(clickHandler);

      dir.onMouseDown(mouseEvent("mousedown", 0, 50, 60));
      dir.onMouseUp(mouseEvent("mouseup", 0, 80, 90)); // moved = no click
      expect(clickHandler).not.toHaveBeenCalled();
    });

    it("emits myMouseUp", () => {
      const handler = vi.fn();
      dir.myMouseUp.subscribe(handler);
      dir.onMouseDown(mouseEvent("mousedown", 0, 0, 0));
      dir.onMouseUp(mouseEvent("mouseup", 0, 0, 0));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("sets isMouseDown[button] to false", () => {
      dir.onMouseDown(mouseEvent("mousedown", 0, 0, 0));
      dir.onMouseUp(mouseEvent("mouseup", 0, 0, 0));
      expect(dir.isMouseDown[0]).toBe(false);
    });

    it("emits myMouseStopDrag on mouseup", () => {
      const handler = vi.fn();
      dir.myMouseStopDrag.subscribe(handler);
      dir.onMouseDown(mouseEvent("mousedown", 0, 0, 0));
      dir.onMouseUp(mouseEvent("mouseup", 0, 5, 5));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("onMouseLeave", () => {
    it("emits myMouseOut", () => {
      const handler = vi.fn();
      dir.myMouseOut.subscribe(handler);
      dir.onMouseLeave(mouseEvent("mouseout", 0, 0, 0));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("clears all drag states on leave", () => {
      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20));
      dir.onMouseDown(mouseEvent("mousedown", 2, 10, 20));
      dir.onMouseLeave(mouseEvent("mouseout", 0, 0, 0));
      expect(dir.isMouseDown[0]).toBe(false);
      expect(dir.isMouseDown[2]).toBe(false);
    });
  });

  describe("onContextMenu", () => {
    it("returns false to suppress the context menu", () => {
      expect(dir.onContextMenu({})).toBe(false);
    });
  });

  describe("onMouseMove", () => {
    it("emits myMouseMove when not dragging", () => {
      const handler = vi.fn();
      dir.myMouseMove.subscribe(handler);
      dir.onMouseMove({ clientX: 5, clientY: 5 } as any);
      expect(handler).toHaveBeenCalled();
    });

    it("emits myMouseDrag (not myMouseMove) while dragging", () => {
      const moveHandler = vi.fn();
      const dragHandler = vi.fn();
      dir.myMouseMove.subscribe(moveHandler);
      dir.myMouseDrag.subscribe(dragHandler);

      dir.onMouseDown(mouseEvent("mousedown", 0, 10, 20));
      dir.onMouseMove({ clientX: 15, clientY: 25, button: 0 } as any);

      expect(dragHandler).toHaveBeenCalled();
      expect(moveHandler).not.toHaveBeenCalled();
    });
  });
});
