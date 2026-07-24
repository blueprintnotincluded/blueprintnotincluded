import { parseChord, serializeChord } from "./key-chord";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_CATEGORIES,
  ShortcutAction,
  getShortcutAction,
  getShortcutActionsByCategory,
  isShortcutActionId,
} from "./shortcut-actions";

describe("shortcut action catalogue", () => {
  it("has a unique id per action", () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes every id through the ShortcutAction map", () => {
    const declared = new Set(Object.values(ShortcutAction));
    for (const action of SHORTCUT_ACTIONS)
      expect(declared.has(action.id)).toBe(true);
    expect(declared.size).toBe(SHORTCUT_ACTIONS.length);
  });

  it("puts every action in a known category", () => {
    const categories = new Set(SHORTCUT_CATEGORIES.map((c) => c.id));
    for (const action of SHORTCUT_ACTIONS)
      expect(categories.has(action.category)).toBe(true);
  });

  it("gives every action a label", () => {
    for (const action of SHORTCUT_ACTIONS)
      expect(action.label.length).toBeGreaterThan(0);
  });

  // A default that doesn't parse would silently vanish on first load.
  it("only ships default chords that round trip", () => {
    for (const action of SHORTCUT_ACTIONS)
      for (const serialized of action.defaults) {
        const chord = parseChord(serialized);
        expect(chord, `${action.id} default "${serialized}"`).not.toBeNull();
        expect(serializeChord(chord!)).toBe(serialized);
      }
  });

  // Two actions on one key means one of them is unreachable by default.
  it("has no duplicate default bindings", () => {
    const owners = new Map<string, string>();
    for (const action of SHORTCUT_ACTIONS)
      for (const chord of action.defaults) {
        expect(
          owners.get(chord),
          `${chord} is bound to both ${owners.get(chord)} and ${action.id}`,
        ).toBeUndefined();
        owners.set(chord, action.id);
      }
  });

  describe("lookup helpers", () => {
    it("finds an action by id", () => {
      expect(getShortcutAction(ShortcutAction.editUndo)?.category).toBe("edit");
    });

    it("returns undefined for an unknown id", () => {
      expect(getShortcutAction("nope" as never)).toBeUndefined();
    });

    it("narrows known ids", () => {
      expect(isShortcutActionId("edit.undo")).toBe(true);
      expect(isShortcutActionId("edit.nonsense")).toBe(false);
    });

    it("groups actions by category", () => {
      const camera = getShortcutActionsByCategory("camera");
      expect(camera.length).toBeGreaterThan(0);
      expect(camera.every((action) => action.category == "camera")).toBe(true);
    });
  });

  describe("game defaults", () => {
    // The ONI bindings this feature is meant to mirror.
    it.each([
      [ShortcutAction.cameraPanUp, "KeyW"],
      [ShortcutAction.cameraPanDown, "KeyS"],
      [ShortcutAction.cameraPanLeft, "KeyA"],
      [ShortcutAction.cameraPanRight, "KeyD"],
      [ShortcutAction.cameraHome, "KeyH"],
      [ShortcutAction.buildRotate, "KeyO"],
      [ShortcutAction.toolBuild, "KeyB"],
    ])("binds %s to the game's %s", (actionId, code) => {
      expect(getShortcutAction(actionId)?.defaults).toContain(code);
    });
  });
});
