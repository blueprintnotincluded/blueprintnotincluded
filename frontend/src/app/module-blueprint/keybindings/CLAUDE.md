# keybindings/ — design notes

Design notes for the editor's keybinding/shortcut-action layer. Loaded
automatically by Claude Code when working in this directory. See root
`CLAUDE.md` for project-wide setup, commands, and constraints.

### Keyboard shortcuts

Editor input goes through an action layer, never raw key comparisons.

- **`shortcut-actions.ts`** — the catalogue of
  rebindable actions (id, category, label, default chords). Defaults mirror Oxygen Not
  Included's own controls where the game has an equivalent action; website-only actions take
  keys the game leaves free. Adding a shortcut = one entry here + one handler registration.
- **`key-chord.ts`** — chord model over `KeyboardEvent.code` (physical key, like
  the game), with pure parse/serialize/format helpers. Serialized modifier order is fixed
  (`Ctrl+Alt+Shift+Meta+Code`); a spec fails on any default written out of order.
- **`services/keybinding.service.ts`** — resolves chord → action, detects conflicts, and
  persists **only the user's diff from the defaults** (`localStorage['bpni-keybindings-v1']`)
  so future default changes still reach existing users.
- **`services/keyboard-shortcut.service.ts`** — dispatcher. Components call
  `register(actionId, handler)` and never see a key. Handlers are LIFO (a transient owner
  shadows the editor-wide one) and returning `false` declines an action that doesn't apply
  right now. Text inputs are guarded centrally here.
- **Tools** implement `handleShortcut(action): boolean`, not `keyDown(keyCode)`.
- **UI**: `components/dialogs/dialog-keybindings/` — Edit ▸ Keyboard shortcuts, or `Shift+/`.
