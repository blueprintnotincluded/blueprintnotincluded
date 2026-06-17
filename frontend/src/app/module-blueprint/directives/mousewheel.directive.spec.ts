import { MouseWheelDirective } from "./mousewheel.directive";

const wheelEvent = (wheelDelta: number) =>
  ({
    wheelDelta,
    detail: 0,
    returnValue: true,
    preventDefault: vi.fn(),
  } as any);

describe("MouseWheelDirective", () => {
  let dir: MouseWheelDirective;

  beforeEach(() => {
    dir = new MouseWheelDirective();
  });

  describe("mouseWheelFunc", () => {
    it("emits mouseWheelUp on positive wheelDelta", () => {
      const upHandler = vi.fn();
      dir.mouseWheelUp.subscribe(upHandler);
      dir.mouseWheelFunc(wheelEvent(120));
      expect(upHandler).toHaveBeenCalledTimes(1);
    });

    it("emits mouseWheelDown on negative wheelDelta", () => {
      const downHandler = vi.fn();
      dir.mouseWheelDown.subscribe(downHandler);
      dir.mouseWheelFunc(wheelEvent(-120));
      expect(downHandler).toHaveBeenCalledTimes(1);
    });

    it("emits mouseWheel on any non-zero delta", () => {
      const wheelHandler = vi.fn();
      dir.mouseWheel.subscribe(wheelHandler);
      dir.mouseWheelFunc(wheelEvent(120));
      expect(wheelHandler).toHaveBeenCalledTimes(1);
    });

    it("emits mouseWheel on negative delta too", () => {
      const wheelHandler = vi.fn();
      dir.mouseWheel.subscribe(wheelHandler);
      dir.mouseWheelFunc(wheelEvent(-120));
      expect(wheelHandler).toHaveBeenCalledTimes(1);
    });

    it("does not emit when delta is 0", () => {
      const wheelHandler = vi.fn();
      const upHandler = vi.fn();
      const downHandler = vi.fn();
      dir.mouseWheel.subscribe(wheelHandler);
      dir.mouseWheelUp.subscribe(upHandler);
      dir.mouseWheelDown.subscribe(downHandler);
      dir.mouseWheelFunc(wheelEvent(0));
      expect(wheelHandler).not.toHaveBeenCalled();
      expect(upHandler).not.toHaveBeenCalled();
      expect(downHandler).not.toHaveBeenCalled();
    });

    it("does not emit mouseWheelDown on positive delta", () => {
      const downHandler = vi.fn();
      dir.mouseWheelDown.subscribe(downHandler);
      dir.mouseWheelFunc(wheelEvent(120));
      expect(downHandler).not.toHaveBeenCalled();
    });

    it("does not emit mouseWheelUp on negative delta", () => {
      const upHandler = vi.fn();
      dir.mouseWheelUp.subscribe(upHandler);
      dir.mouseWheelFunc(wheelEvent(-120));
      expect(upHandler).not.toHaveBeenCalled();
    });

    it("clamps delta to 1 for large positive wheelDelta", () => {
      const e = wheelEvent(999);
      dir.mouseWheelFunc(e);
      expect(e.delta).toBe(1);
    });

    it("clamps delta to -1 for large negative wheelDelta", () => {
      const e = wheelEvent(-999);
      dir.mouseWheelFunc(e);
      expect(e.delta).toBe(-1);
    });

    it("falls back to -detail when wheelDelta absent", () => {
      const upHandler = vi.fn();
      dir.mouseWheelUp.subscribe(upHandler);
      const e = {
        detail: -3,
        returnValue: true,
        preventDefault: vi.fn(),
      } as any;
      dir.mouseWheelFunc(e);
      expect(upHandler).toHaveBeenCalled();
    });
  });

  describe("onMouseWheelChrome", () => {
    it("delegates to mouseWheelFunc", () => {
      const spy = vi.spyOn(dir, "mouseWheelFunc");
      const e = wheelEvent(120);
      dir.onMouseWheelChrome(e);
      expect(spy).toHaveBeenCalledWith(e);
    });
  });

  describe("onMouseWheelFirefox", () => {
    it("delegates to mouseWheelFunc", () => {
      const spy = vi.spyOn(dir, "mouseWheelFunc");
      const e = wheelEvent(-120);
      dir.onMouseWheelFirefox(e);
      expect(spy).toHaveBeenCalledWith(e);
    });
  });
});
