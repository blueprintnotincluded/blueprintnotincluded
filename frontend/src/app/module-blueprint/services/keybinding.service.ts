import { Injectable } from "@angular/core";
import { Observable, Subject } from "rxjs";
import {
  KeyChord,
  chordEquals,
  formatChord,
  parseChord,
  serializeChord,
} from "../keybindings/key-chord";
import {
  SHORTCUT_ACTIONS,
  ShortcutActionId,
  getShortcutAction,
  isShortcutActionId,
} from "../keybindings/shortcut-actions";

// Only the *differences* from the defaults are persisted. That way a default
// we change later (or a new action we add) reaches existing users instead of
// being frozen by a snapshot written on their first visit.
const STORAGE_KEY = "bpni-keybindings-v1";

type Overrides = Record<string, string[]>;

@Injectable({ providedIn: "root" })
export class KeybindingService {
  private overrides: Overrides = {};

  // serialized chord -> actions bound to it, rebuilt whenever bindings change
  private chordIndex = new Map<string, ShortcutActionId[]>();

  private changedSubject = new Subject<void>();
  get changed(): Observable<void> {
    return this.changedSubject.asObservable();
  }

  constructor() {
    this.overrides = this.readOverrides();
    this.rebuildIndex();
  }

  getSerializedChords(actionId: ShortcutActionId): string[] {
    const override = this.overrides[actionId];
    if (override != null) return [...override];
    return [...(getShortcutAction(actionId)?.defaults ?? [])];
  }

  getChords(actionId: ShortcutActionId): KeyChord[] {
    return this.getSerializedChords(actionId)
      .map((serialized) => parseChord(serialized))
      .filter((chord): chord is KeyChord => chord != null);
  }

  isCustomized(actionId: ShortcutActionId): boolean {
    return this.overrides[actionId] != null;
  }

  // ⌘/⌥ read better than Meta/Alt on a Mac, and are what the OS prints.
  readonly isApple =
    typeof navigator != "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);

  // The key an action currently answers to, as a short label for a tooltip or
  // a button ("O", "Del", "Ctrl + Z"): the first bound chord, formatted for
  // this platform. "" for an unbound action, so a hint disappears instead of
  // naming a key that does nothing. Every key named in the UI goes through
  // here rather than being written into the text, so a rebind updates the
  // hint and a user who unbinds a key is not told to press it.
  hint(actionId: ShortcutActionId): string {
    const chord = this.getChords(actionId)[0];
    return chord == null ? "" : formatChord(chord, this.isApple);
  }

  // "Rotate (O)" - a label with the action's key hint after it, or the bare
  // label when the action is unbound.
  withHint(label: string, actionId: ShortcutActionId): string {
    const hint = this.hint(actionId);
    return hint == "" ? label : `${label} (${hint})`;
  }

  setChords(actionId: ShortcutActionId, chords: KeyChord[]): void {
    const serialized = chords.map((chord) => serializeChord(chord));
    const defaults = getShortcutAction(actionId)?.defaults ?? [];

    // Setting an action back to exactly its defaults drops the override, so it
    // keeps tracking the defaults again.
    if (sameChordList(serialized, defaults)) delete this.overrides[actionId];
    else this.overrides[actionId] = serialized;

    this.commit();
  }

  addChord(actionId: ShortcutActionId, chord: KeyChord): void {
    const chords = this.getChords(actionId);
    if (chords.some((existing) => chordEquals(existing, chord))) return;
    this.setChords(actionId, [...chords, chord]);
  }

  removeChord(actionId: ShortcutActionId, chord: KeyChord): void {
    const chords = this.getChords(actionId).filter(
      (existing) => !chordEquals(existing, chord),
    );
    this.setChords(actionId, chords);
  }

  resetAction(actionId: ShortcutActionId): void {
    if (this.overrides[actionId] == null) return;
    delete this.overrides[actionId];
    this.commit();
  }

  resetAll(): void {
    this.overrides = {};
    this.commit();
  }

  // The action a chord currently triggers. When several actions share a chord
  // (only reachable by a user rebinding into a conflict) registry order wins,
  // so the behaviour is at least deterministic.
  resolve(chord: KeyChord): ShortcutActionId | null {
    const actions = this.chordIndex.get(serializeChord(chord));
    return actions == null || actions.length == 0 ? null : actions[0];
  }

  // Actions already using this chord - used by the settings UI to warn before
  // a rebind silently shadows something else.
  findConflicts(
    chord: KeyChord,
    exceptAction?: ShortcutActionId,
  ): ShortcutActionId[] {
    const actions = this.chordIndex.get(serializeChord(chord)) ?? [];
    return actions.filter((actionId) => actionId != exceptAction);
  }

  private commit(): void {
    this.rebuildIndex();
    this.writeOverrides();
    this.changedSubject.next();
  }

  private rebuildIndex(): void {
    this.chordIndex = new Map<string, ShortcutActionId[]>();
    for (const action of SHORTCUT_ACTIONS)
      for (const chord of this.getChords(action.id)) {
        const key = serializeChord(chord);
        const bound = this.chordIndex.get(key);
        if (bound == null) this.chordIndex.set(key, [action.id]);
        else bound.push(action.id);
      }
  }

  private readOverrides(): Overrides {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). Defaults
      // still work, they just don't persist.
      return {};
    }
    if (raw == null) return {};

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("Ignoring unreadable keyboard shortcut settings");
      return {};
    }
    if (parsed == null || typeof parsed != "object") return {};

    const overrides: Overrides = {};
    for (const [actionId, chords] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      // Skip actions we no longer have, and any chord string we can't parse.
      if (!isShortcutActionId(actionId)) continue;
      if (!Array.isArray(chords)) continue;
      overrides[actionId] = chords
        .filter((chord): chord is string => typeof chord == "string")
        .map((chord) => parseChord(chord))
        .filter((chord): chord is KeyChord => chord != null)
        .map((chord) => serializeChord(chord));
    }
    return overrides;
  }

  private writeOverrides(): void {
    try {
      if (Object.keys(this.overrides).length == 0)
        localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(this.overrides));
    } catch {
      // Non-fatal: the session keeps the new bindings, they just aren't saved.
      console.warn("Could not save keyboard shortcut settings");
    }
  }
}

function sameChordList(a: string[], b: string[]): boolean {
  return a.length == b.length && a.every((chord, index) => chord == b[index]);
}
