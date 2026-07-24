import {
  KeyboardShortcutService,
  isEditableTarget,
} from "./keyboard-shortcut.service";
import { KeybindingService } from "./keybinding.service";
import { ShortcutAction } from "../keybindings/shortcut-actions";

// Dispatch reads event.target, which a plain `new KeyboardEvent` leaves null
// until it is actually dispatched - so build the event against a real element.
const press = (
  service: KeyboardShortcutService,
  init: Partial<KeyboardEventInit> & { code: string },
  target: EventTarget = document.createElement("div"),
) => {
  const event = new KeyboardEvent("keydown", { ...init, cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  const handled = service.handleKeyEvent(event);
  return { handled, event };
};

describe("KeyboardShortcutService", () => {
  let service: KeyboardShortcutService;

  beforeEach(() => {
    localStorage.clear();
    service = new KeyboardShortcutService(new KeybindingService());
  });

  describe("dispatch", () => {
    it("runs the handler bound to the pressed key", () => {
      const handler = vi.fn();
      service.register(ShortcutAction.cameraPanUp, handler);

      const { handled, event } = press(service, { code: "KeyW" });

      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it("does nothing for a key nothing is bound to", () => {
      const handler = vi.fn();
      service.register(ShortcutAction.cameraPanUp, handler);

      const { handled, event } = press(service, { code: "F9" });

      expect(handled).toBe(false);
      expect(handler).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    // The binding is what changed, not the handler - that is the whole point.
    it("reaches the same handler through a rebound key", () => {
      const keybindingService = new KeybindingService();
      const shortcuts = new KeyboardShortcutService(keybindingService);
      const handler = vi.fn();
      shortcuts.register(ShortcutAction.cameraPanUp, handler);

      keybindingService.setChords(ShortcutAction.cameraPanUp, [
        { code: "KeyI", ctrl: false, alt: false, shift: false, meta: false },
      ]);

      expect(press(shortcuts, { code: "KeyW" }).handled).toBe(false);
      expect(press(shortcuts, { code: "KeyI" }).handled).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });

    it("requires the exact modifiers of the binding", () => {
      const undo = vi.fn();
      service.register(ShortcutAction.editUndo, undo);

      expect(press(service, { code: "KeyZ" }).handled).toBe(false);
      expect(press(service, { code: "KeyZ", ctrlKey: true }).handled).toBe(
        true,
      );
      expect(undo).toHaveBeenCalledOnce();
    });

    it("ignores an action with no handler registered", () => {
      expect(press(service, { code: "KeyW" }).handled).toBe(false);
    });

    it("ignores bare modifier presses", () => {
      const handler = vi.fn();
      service.register(ShortcutAction.cameraPanUp, handler);
      expect(
        press(service, { code: "ShiftLeft", shiftKey: true }).handled,
      ).toBe(false);
    });
  });

  describe("handler priority", () => {
    it("gives the most recently registered handler first refusal", () => {
      const order: string[] = [];
      service.register(ShortcutAction.interfaceCancel, () => {
        order.push("first");
      });
      service.register(ShortcutAction.interfaceCancel, () => {
        order.push("second");
      });

      press(service, { code: "Escape" });

      expect(order).toEqual(["second"]);
    });

    it("falls through to the next handler when one declines", () => {
      const fallback = vi.fn();
      service.register(ShortcutAction.interfaceCancel, fallback);
      service.register(ShortcutAction.interfaceCancel, () => false);

      const { handled } = press(service, { code: "Escape" });

      expect(handled).toBe(true);
      expect(fallback).toHaveBeenCalledOnce();
    });

    it("leaves the event alone when every handler declines", () => {
      service.register(ShortcutAction.interfaceCancel, () => false);
      const { handled, event } = press(service, { code: "Escape" });
      expect(handled).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    });

    it("stops calling a handler once it is unregistered", () => {
      const handler = vi.fn();
      const unregister = service.register(ShortcutAction.cameraPanUp, handler);
      unregister();

      expect(press(service, { code: "KeyW" }).handled).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("auto-repeat", () => {
    it("repeats actions that opt in, so panning can be held down", () => {
      const pan = vi.fn();
      service.register(ShortcutAction.cameraPanUp, pan);
      expect(press(service, { code: "KeyW", repeat: true }).handled).toBe(true);
    });

    it("swallows repeats for one-shot actions", () => {
      const rotate = vi.fn();
      service.register(ShortcutAction.buildRotate, rotate);

      expect(press(service, { code: "KeyO", repeat: true }).handled).toBe(
        false,
      );
      expect(rotate).not.toHaveBeenCalled();
    });
  });

  describe("text entry", () => {
    it.each(["INPUT", "TEXTAREA", "SELECT"])(
      "never fires while typing in a %s",
      (tagName) => {
        const handler = vi.fn();
        service.register(ShortcutAction.cameraPanUp, handler);

        const target = document.createElement(tagName);
        expect(press(service, { code: "KeyW" }, target).handled).toBe(false);
        expect(handler).not.toHaveBeenCalled();
      },
    );

    it("never fires inside a contenteditable region", () => {
      const handler = vi.fn();
      service.register(ShortcutAction.cameraPanUp, handler);

      const target = document.createElement("div");
      Object.defineProperty(target, "isContentEditable", { value: true });

      expect(press(service, { code: "KeyW" }, target).handled).toBe(false);
    });
  });

  describe("setEnabled", () => {
    // The settings dialog turns dispatch off while capturing, so binding
    // "Delete" doesn't delete the selection on the way in.
    it("suppresses every shortcut while disabled", () => {
      const handler = vi.fn();
      service.register(ShortcutAction.cameraPanUp, handler);

      service.setEnabled(false);
      expect(press(service, { code: "KeyW" }).handled).toBe(false);

      service.setEnabled(true);
      expect(press(service, { code: "KeyW" }).handled).toBe(true);
    });
  });
});

describe("isEditableTarget", () => {
  it("is false for a null target", () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it("is false for an ordinary element", () => {
    expect(isEditableTarget(document.createElement("canvas"))).toBe(false);
  });

  it("is true for form fields", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
  });
});
