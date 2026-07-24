import { Injectable } from "@angular/core";
import { chordFromEvent } from "../keybindings/key-chord";
import {
  ShortcutActionId,
  getShortcutAction,
} from "../keybindings/shortcut-actions";
import { KeybindingService } from "./keybinding.service";

// A handler returns false to decline the action (it wasn't applicable right
// now - nothing selected, tool not active, ...) so the next registered handler
// gets a shot and the browser keeps its default behaviour. Anything else,
// including undefined, means "handled".
export type ShortcutHandler = (event: KeyboardEvent) => boolean | void;

/**
 * Turns raw keyboard events into editor actions.
 *
 * Components never look at keys: they register a handler for an action id and
 * this service decides, via {@link KeybindingService}, which key reaches them.
 * That is the whole point of the abstraction - a shortcut can be rebound, or
 * bound to several keys, without any of its handlers knowing.
 */
@Injectable({ providedIn: "root" })
export class KeyboardShortcutService {
  // Handlers are kept newest-first so a transient owner (a dialog, a modal
  // tool) shadows the permanent editor-wide handler while it is registered.
  private handlers = new Map<ShortcutActionId, ShortcutHandler[]>();

  // Flipped off while the settings dialog is capturing a key, so binding
  // "Delete" doesn't delete the selection on the way in.
  private enabled = true;

  constructor(private keybindingService: KeybindingService) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  register(actionId: ShortcutActionId, handler: ShortcutHandler): () => void {
    const existing = this.handlers.get(actionId);
    if (existing == null) this.handlers.set(actionId, [handler]);
    else existing.unshift(handler);

    return () => {
      const handlers = this.handlers.get(actionId);
      if (handlers == null) return;
      const index = handlers.indexOf(handler);
      if (index != -1) handlers.splice(index, 1);
    };
  }

  /** Resolves an event to an action and runs it. Returns true when handled. */
  handleKeyEvent(event: KeyboardEvent): boolean {
    if (!this.enabled) return false;
    if (isEditableTarget(event.target)) return false;

    const chord = chordFromEvent(event);
    if (chord == null) return false;

    const actionId = this.keybindingService.resolve(chord);
    if (actionId == null) return false;

    if (event.repeat && !getShortcutAction(actionId)?.allowAutoRepeat)
      return false;

    const handlers = this.handlers.get(actionId);
    if (handlers == null || handlers.length == 0) return false;

    // Iterate over a copy: a handler is allowed to unregister itself.
    for (const handler of [...handlers])
      if (handler(event) !== false) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

    return false;
  }
}

// Typing in a form field must never trigger an editor action, and browser-level
// editing shortcuts (Ctrl+Z in a textarea) must stay native.
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element == null || element.tagName == null) return false;

  const tagName = element.tagName.toUpperCase();
  if (tagName == "INPUT" || tagName == "TEXTAREA" || tagName == "SELECT")
    return true;

  return element.isContentEditable === true;
}
