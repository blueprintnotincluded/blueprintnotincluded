import { KeybindingService } from "./keybinding.service";
import { makeChord } from "../keybindings/key-chord";
import {
  ShortcutAction,
  getShortcutAction,
} from "../keybindings/shortcut-actions";

const STORAGE_KEY = "bpni-keybindings-v1";

const stored = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw == null ? null : JSON.parse(raw);
};

describe("KeybindingService", () => {
  let service: KeybindingService;

  beforeEach(() => {
    localStorage.clear();
    service = new KeybindingService();
  });

  describe("defaults", () => {
    it("starts from the catalogue defaults", () => {
      expect(service.getSerializedChords(ShortcutAction.cameraPanUp)).toEqual(
        getShortcutAction(ShortcutAction.cameraPanUp)!.defaults,
      );
    });

    it("parses defaults into chords", () => {
      expect(service.getChords(ShortcutAction.editUndo)).toContainEqual(
        makeChord("KeyZ", { ctrl: true }),
      );
    });

    it("reports nothing as customized", () => {
      expect(service.isCustomized(ShortcutAction.cameraPanUp)).toBe(false);
      expect(stored()).toBeNull();
    });
  });

  describe("resolve", () => {
    it("maps a bound chord to its action", () => {
      expect(service.resolve(makeChord("KeyW"))).toBe(
        ShortcutAction.cameraPanUp,
      );
    });

    it("resolves every chord of a multi-key action", () => {
      expect(service.resolve(makeChord("ArrowUp"))).toBe(
        ShortcutAction.cameraPanUp,
      );
    });

    it("requires an exact modifier match", () => {
      expect(service.resolve(makeChord("KeyW", { ctrl: true }))).toBeNull();
    });

    it("returns null for an unbound chord", () => {
      expect(service.resolve(makeChord("F9"))).toBeNull();
    });
  });

  describe("customizing", () => {
    it("adds a chord and persists only the override", () => {
      service.addChord(ShortcutAction.cameraHome, makeChord("KeyG"));

      expect(service.resolve(makeChord("KeyG"))).toBe(
        ShortcutAction.cameraHome,
      );
      expect(service.isCustomized(ShortcutAction.cameraHome)).toBe(true);
      expect(Object.keys(stored())).toEqual([ShortcutAction.cameraHome]);
    });

    it("ignores a chord the action already has", () => {
      service.addChord(ShortcutAction.cameraPanUp, makeChord("KeyW"));
      expect(service.isCustomized(ShortcutAction.cameraPanUp)).toBe(false);
    });

    it("removes a chord", () => {
      service.removeChord(ShortcutAction.cameraPanUp, makeChord("KeyW"));

      expect(service.resolve(makeChord("KeyW"))).toBeNull();
      expect(service.getSerializedChords(ShortcutAction.cameraPanUp)).toEqual([
        "ArrowUp",
      ]);
    });

    it("supports unbinding an action entirely", () => {
      service.setChords(ShortcutAction.cameraPanUp, []);
      expect(service.getChords(ShortcutAction.cameraPanUp)).toEqual([]);
      expect(service.resolve(makeChord("KeyW"))).toBeNull();
    });

    // Otherwise a user who happens to reproduce the defaults would be frozen
    // on them and stop picking up future default changes.
    it("drops the override when the chords match the defaults again", () => {
      service.addChord(ShortcutAction.cameraHome, makeChord("KeyG"));
      service.removeChord(ShortcutAction.cameraHome, makeChord("KeyG"));

      expect(service.isCustomized(ShortcutAction.cameraHome)).toBe(false);
      expect(stored()).toBeNull();
    });

    it("resets a single action", () => {
      service.setChords(ShortcutAction.cameraPanUp, [makeChord("KeyI")]);
      service.resetAction(ShortcutAction.cameraPanUp);

      expect(service.isCustomized(ShortcutAction.cameraPanUp)).toBe(false);
      expect(service.resolve(makeChord("KeyW"))).toBe(
        ShortcutAction.cameraPanUp,
      );
    });

    it("resets everything", () => {
      service.setChords(ShortcutAction.cameraPanUp, [makeChord("KeyI")]);
      service.setChords(ShortcutAction.cameraPanDown, [makeChord("KeyK")]);
      service.resetAll();

      expect(stored()).toBeNull();
      expect(service.resolve(makeChord("KeyW"))).toBe(
        ShortcutAction.cameraPanUp,
      );
    });

    it("emits a change notification", () => {
      const onChange = vi.fn();
      service.changed.subscribe(onChange);
      service.addChord(ShortcutAction.cameraHome, makeChord("KeyG"));
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("findConflicts", () => {
    it("reports the action already using a chord", () => {
      expect(service.findConflicts(makeChord("KeyW"))).toEqual([
        ShortcutAction.cameraPanUp,
      ]);
    });

    it("excludes the action being rebound", () => {
      expect(
        service.findConflicts(makeChord("KeyW"), ShortcutAction.cameraPanUp),
      ).toEqual([]);
    });

    it("reports nothing for a free chord", () => {
      expect(service.findConflicts(makeChord("F9"))).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("reloads overrides from storage", () => {
      service.setChords(ShortcutAction.cameraHome, [makeChord("KeyG")]);

      const reloaded = new KeybindingService();
      expect(reloaded.resolve(makeChord("KeyG"))).toBe(
        ShortcutAction.cameraHome,
      );
      expect(reloaded.resolve(makeChord("KeyH"))).toBeNull();
    });

    it("ignores unparseable storage", () => {
      localStorage.setItem(STORAGE_KEY, "{not json");
      const reloaded = new KeybindingService();
      expect(reloaded.resolve(makeChord("KeyW"))).toBe(
        ShortcutAction.cameraPanUp,
      );
    });

    // Renamed or retired actions must not resurrect themselves.
    it("drops entries for actions that no longer exist", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ "camera.warpToMars": ["KeyG"] }),
      );
      const reloaded = new KeybindingService();
      expect(reloaded.resolve(makeChord("KeyG"))).toBeNull();
    });

    it("drops chord strings it cannot parse", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ "camera.home": ["Hyper+KeyG", "KeyG"] }),
      );
      const reloaded = new KeybindingService();
      expect(reloaded.getSerializedChords(ShortcutAction.cameraHome)).toEqual([
        "KeyG",
      ]);
    });

    it("survives storage being unavailable", () => {
      const setItem = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceeded");
        });

      expect(() =>
        service.addChord(ShortcutAction.cameraHome, makeChord("KeyG")),
      ).not.toThrow();
      // The session still gets the new binding, it just isn't saved.
      expect(service.resolve(makeChord("KeyG"))).toBe(
        ShortcutAction.cameraHome,
      );

      setItem.mockRestore();
    });
  });
});
