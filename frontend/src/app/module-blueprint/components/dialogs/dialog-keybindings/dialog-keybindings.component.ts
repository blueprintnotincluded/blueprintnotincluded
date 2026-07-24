import { Component, HostListener, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";
import {
  KeyChord,
  chordFromEvent,
  formatChord,
  isModifierCode,
} from "../../../keybindings/key-chord";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_CATEGORIES,
  ShortcutActionId,
  ShortcutCategoryDefinition,
  getShortcutAction,
  getShortcutActionsByCategory,
} from "../../../keybindings/shortcut-actions";
import { KeybindingService } from "../../../services/keybinding.service";
import { KeyboardShortcutService } from "../../../services/keyboard-shortcut.service";

// One rendered row: an action, the keys currently bound to it, and whether the
// user has moved it away from the game defaults.
export interface KeybindingRow {
  actionId: ShortcutActionId;
  label: string;
  chords: KeyChord[];
  chordLabels: string[];
  customized: boolean;
}

export interface KeybindingCategoryView {
  category: ShortcutCategoryDefinition;
  rows: KeybindingRow[];
}

@Component({
  selector: "app-dialog-keybindings",
  templateUrl: "./dialog-keybindings.component.html",
  styleUrls: ["./dialog-keybindings.component.css"],
  standalone: false,
})
export class DialogKeybindingsComponent implements OnInit, OnDestroy {
  visible: boolean = false;
  categories: KeybindingCategoryView[] = [];

  // The action currently waiting for a key press, if any.
  capturingActionId: ShortcutActionId | null = null;
  // Set when the captured key is already bound elsewhere.
  conflictMessage: string | null = null;

  private changedSubscription: Subscription | null = null;

  // ⌘/⌥ read better than Meta/Alt on a Mac, and are what the OS prints.
  readonly isApple =
    typeof navigator != "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);

  readonly addKeyLabel = $localize`:keyboard shortcut settings:Add key`;
  readonly capturingLabel = $localize`:keyboard shortcut settings:Press a key…`;

  constructor(
    private keybindingService: KeybindingService,
    private shortcutService: KeyboardShortcutService,
  ) {}

  ngOnInit() {
    this.rebuild();
    this.changedSubscription = this.keybindingService.changed.subscribe(() =>
      this.rebuild(),
    );
  }

  ngOnDestroy() {
    this.changedSubscription?.unsubscribe();
    this.stopCapture();
  }

  showDialog() {
    this.visible = true;
  }

  toggleDialog() {
    this.visible = !this.visible;
  }

  // p-dialog two-way binds `visible`; capture must not survive a close.
  onVisibleChange(visible: boolean) {
    this.visible = visible;
    if (!visible) this.stopCapture();
  }

  formatChord(chord: KeyChord): string {
    return formatChord(chord, this.isApple);
  }

  isCapturing(actionId: ShortcutActionId): boolean {
    return this.capturingActionId == actionId;
  }

  startCapture(actionId: ShortcutActionId) {
    this.capturingActionId = actionId;
    this.conflictMessage = null;
    // While capturing, a key press is data - it must not also fire the action
    // it is bound to.
    this.shortcutService.setEnabled(false);
  }

  stopCapture() {
    this.capturingActionId = null;
    this.shortcutService.setEnabled(true);
  }

  // Listening on the document, not the dialog, so capture works no matter
  // where focus ended up. It is a no-op unless a capture is in progress.
  @HostListener("document:keydown", ["$event"])
  onKeyDown(event: KeyboardEvent) {
    if (this.capturingActionId == null) return;

    // Wait for the real key while the user is still holding modifiers down.
    if (isModifierCode(event.code)) return;

    event.preventDefault();
    event.stopPropagation();

    // Escape always means "never mind", so it can't be captured here. It can
    // still be rebound by resetting the action that owns it.
    if (event.code == "Escape") {
      this.stopCapture();
      return;
    }

    const chord = chordFromEvent(event);
    if (chord == null) return;

    const actionId = this.capturingActionId;
    const conflicts = this.keybindingService.findConflicts(chord, actionId);

    // A rebind wins: the chord is taken off whatever held it, so there is
    // never a hidden shadowed binding.
    for (const conflictingAction of conflicts)
      this.keybindingService.removeChord(conflictingAction, chord);

    this.keybindingService.addChord(actionId, chord);
    this.stopCapture();

    if (conflicts.length > 0) {
      const names = conflicts
        .map((id) => getShortcutAction(id)?.label ?? id)
        .join(", ");
      this.conflictMessage = $localize`:keyboard shortcut conflict:Removed this key from: ${names}`;
    }
  }

  removeChord(actionId: ShortcutActionId, chord: KeyChord) {
    this.keybindingService.removeChord(actionId, chord);
  }

  resetAction(actionId: ShortcutActionId) {
    this.keybindingService.resetAction(actionId);
    this.conflictMessage = null;
  }

  resetAll() {
    this.keybindingService.resetAll();
    this.conflictMessage = null;
  }

  get anyCustomized(): boolean {
    return SHORTCUT_ACTIONS.some((action) =>
      this.keybindingService.isCustomized(action.id),
    );
  }

  private rebuild() {
    this.categories = SHORTCUT_CATEGORIES.map((category) => ({
      category,
      rows: getShortcutActionsByCategory(category.id).map((action) => {
        const chords = this.keybindingService.getChords(action.id);
        return {
          actionId: action.id,
          label: action.label,
          chords,
          chordLabels: chords.map((chord) => formatChord(chord, this.isApple)),
          customized: this.keybindingService.isCustomized(action.id),
        };
      }),
    })).filter((view) => view.rows.length > 0);
  }
}
