import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";

import { DialogKeybindingsComponent } from "./dialog-keybindings.component";
import { KeybindingService } from "../../../services/keybinding.service";
import { KeyboardShortcutService } from "../../../services/keyboard-shortcut.service";
import { makeChord } from "../../../keybindings/key-chord";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_CATEGORIES,
  ShortcutAction,
  ShortcutActionId,
} from "../../../keybindings/shortcut-actions";

const capture = (code: string, init: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent("keydown", { code, ...init, cancelable: true });

describe("DialogKeybindingsComponent", () => {
  let component: DialogKeybindingsComponent;
  let fixture: ComponentFixture<DialogKeybindingsComponent>;
  let keybindingService: KeybindingService;
  let shortcutService: KeyboardShortcutService;

  const rowFor = (actionId: ShortcutActionId) =>
    component.categories
      .flatMap((categoryView) => categoryView.rows)
      .find((row) => row.actionId == actionId)!;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      declarations: [DialogKeybindingsComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogKeybindingsComponent);
    component = fixture.componentInstance;
    keybindingService = TestBed.inject(KeybindingService);
    shortcutService = TestBed.inject(KeyboardShortcutService);
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("rendered rows", () => {
    it("lists every action, grouped by category", () => {
      const rows = component.categories.flatMap(
        (categoryView) => categoryView.rows,
      );
      expect(rows).toHaveLength(SHORTCUT_ACTIONS.length);
      expect(component.categories.length).toBeLessThanOrEqual(
        SHORTCUT_CATEGORIES.length,
      );
    });

    it("shows the keys currently bound to an action", () => {
      expect(rowFor(ShortcutAction.cameraPanUp).chordLabels).toEqual([
        "W",
        "↑",
      ]);
    });

    it("re-renders when the bindings change underneath it", () => {
      keybindingService.setChords(ShortcutAction.cameraPanUp, [
        makeChord("KeyI"),
      ]);
      expect(rowFor(ShortcutAction.cameraPanUp).chordLabels).toEqual(["I"]);
      expect(rowFor(ShortcutAction.cameraPanUp).customized).toBe(true);
    });
  });

  describe("capture", () => {
    // Without this, binding "Delete" would delete the selection on the way in.
    it("suspends shortcut dispatch while waiting for a key", () => {
      const setEnabled = vi.spyOn(shortcutService, "setEnabled");

      component.startCapture(ShortcutAction.cameraHome);
      expect(component.isCapturing(ShortcutAction.cameraHome)).toBe(true);
      expect(setEnabled).toHaveBeenCalledWith(false);

      component.onKeyDown(capture("KeyG"));
      expect(setEnabled).toHaveBeenLastCalledWith(true);
    });

    it("binds the captured key to the action", () => {
      component.startCapture(ShortcutAction.cameraHome);
      component.onKeyDown(capture("KeyG"));

      expect(keybindingService.resolve(makeChord("KeyG"))).toBe(
        ShortcutAction.cameraHome,
      );
      expect(component.isCapturing(ShortcutAction.cameraHome)).toBe(false);
    });

    it("captures modifiers along with the key", () => {
      component.startCapture(ShortcutAction.cameraHome);
      component.onKeyDown(capture("KeyG", { ctrlKey: true, shiftKey: true }));

      expect(
        keybindingService.resolve(
          makeChord("KeyG", { ctrl: true, shift: true }),
        ),
      ).toBe(ShortcutAction.cameraHome);
    });

    it("keeps waiting while only a modifier is held", () => {
      component.startCapture(ShortcutAction.cameraHome);
      component.onKeyDown(capture("ShiftLeft", { shiftKey: true }));
      expect(component.isCapturing(ShortcutAction.cameraHome)).toBe(true);
    });

    it("treats Escape as cancel and binds nothing", () => {
      component.startCapture(ShortcutAction.cameraHome);
      component.onKeyDown(capture("Escape"));

      expect(component.isCapturing(ShortcutAction.cameraHome)).toBe(false);
      expect(keybindingService.isCustomized(ShortcutAction.cameraHome)).toBe(
        false,
      );
    });

    it("ignores key presses when no capture is in progress", () => {
      component.onKeyDown(capture("KeyG"));
      expect(keybindingService.resolve(makeChord("KeyG"))).toBeNull();
    });

    // A shadowed binding the user can't see is worse than a moved one.
    it("takes the key away from whatever held it, and says so", () => {
      component.startCapture(ShortcutAction.cameraHome);
      component.onKeyDown(capture("KeyW"));

      expect(keybindingService.resolve(makeChord("KeyW"))).toBe(
        ShortcutAction.cameraHome,
      );
      expect(rowFor(ShortcutAction.cameraPanUp).chordLabels).toEqual(["↑"]);
      expect(component.conflictMessage).toContain("Pan up");
    });

    it("restores dispatch when the dialog closes mid-capture", () => {
      const setEnabled = vi.spyOn(shortcutService, "setEnabled");
      component.startCapture(ShortcutAction.cameraHome);
      component.onVisibleChange(false);

      expect(component.visible).toBe(false);
      expect(component.isCapturing(ShortcutAction.cameraHome)).toBe(false);
      expect(setEnabled).toHaveBeenLastCalledWith(true);
    });
  });

  describe("unbinding and resetting", () => {
    it("removes a single key", () => {
      component.removeChord(ShortcutAction.cameraPanUp, makeChord("KeyW"));
      expect(rowFor(ShortcutAction.cameraPanUp).chordLabels).toEqual(["↑"]);
    });

    it("resets one action back to the game default", () => {
      keybindingService.setChords(ShortcutAction.cameraPanUp, [
        makeChord("KeyI"),
      ]);
      component.resetAction(ShortcutAction.cameraPanUp);

      expect(rowFor(ShortcutAction.cameraPanUp).chordLabels).toEqual([
        "W",
        "↑",
      ]);
      expect(component.conflictMessage).toBeNull();
    });

    it("resets everything", () => {
      keybindingService.setChords(ShortcutAction.cameraPanUp, [
        makeChord("KeyI"),
      ]);
      keybindingService.setChords(ShortcutAction.cameraHome, [
        makeChord("KeyG"),
      ]);
      expect(component.anyCustomized).toBe(true);

      component.resetAll();

      expect(component.anyCustomized).toBe(false);
      expect(rowFor(ShortcutAction.cameraPanUp).chordLabels).toEqual([
        "W",
        "↑",
      ]);
    });
  });

  it("stops capturing when destroyed", () => {
    const setEnabled = vi.spyOn(shortcutService, "setEnabled");
    component.startCapture(ShortcutAction.cameraHome);
    fixture.destroy();
    expect(setEnabled).toHaveBeenLastCalledWith(true);
  });
});
