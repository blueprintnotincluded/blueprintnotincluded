// A key chord is one physical key plus the modifier state required to trigger
// an action. Everything here is pure so it can be unit tested without a DOM.
//
// We key off KeyboardEvent.code (the *physical* key: "KeyW", "Digit1", "F1")
// rather than KeyboardEvent.key (the character produced). That mirrors how the
// game binds its controls, keeps "Shift + =" a shifted "=" instead of a "+",
// and makes "press a key to rebind" capture unambiguous. The tradeoff is that
// on a non-QWERTY layout the printed label may not match the physical key -
// which is exactly the behaviour ONI itself has.

export interface KeyChord {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

// Pressing a modifier on its own never produces a chord - we'd otherwise
// "capture" Shift while the user is still reaching for the real key.
const MODIFIER_CODES = [
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
];

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.indexOf(code) != -1;
}

export function makeChord(
  code: string,
  modifiers: Partial<Omit<KeyChord, "code">> = {},
): KeyChord {
  return {
    code,
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
    meta: modifiers.meta ?? false,
  };
}

export function chordFromEvent(event: KeyboardEvent): KeyChord | null {
  if (event.code == null || event.code == "" || isModifierCode(event.code))
    return null;

  return {
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export function chordEquals(a: KeyChord, b: KeyChord): boolean {
  return (
    a.code == b.code &&
    a.ctrl == b.ctrl &&
    a.alt == b.alt &&
    a.shift == b.shift &&
    a.meta == b.meta
  );
}

// Serialized form is what gets stored (defaults table + localStorage), so the
// modifier order is fixed: "Ctrl+Alt+Shift+Meta+Code".
export function serializeChord(chord: KeyChord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  if (chord.meta) parts.push("Meta");
  parts.push(chord.code);
  return parts.join("+");
}

export function parseChord(serialized: string): KeyChord | null {
  if (serialized == null) return null;

  const parts = serialized.split("+").filter((p) => p.length > 0);
  if (parts.length == 0) return null;

  const code = parts[parts.length - 1];
  if (isModifierCode(code)) return null;

  const chord = makeChord(code);
  for (const modifier of parts.slice(0, -1)) {
    switch (modifier.toLowerCase()) {
      case "ctrl":
      case "control":
        chord.ctrl = true;
        break;
      case "alt":
      case "option":
        chord.alt = true;
        break;
      case "shift":
        chord.shift = true;
        break;
      case "meta":
      case "cmd":
      case "command":
        chord.meta = true;
        break;
      default:
        // An unknown modifier means the stored string is not something we
        // wrote - drop it rather than silently binding the wrong chord.
        return null;
    }
  }

  return chord;
}

// Physical code -> the label printed on a US keyboard.
const CODE_LABELS: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Delete: "Del",
  Insert: "Ins",
  PageUp: "PgUp",
  PageDown: "PgDn",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
  NumpadEnter: "Num Enter",
  CapsLock: "Caps Lock",
  ContextMenu: "Menu",
};

export function formatCode(code: string): string {
  const mapped = CODE_LABELS[code];
  if (mapped != null) return mapped;
  if (code.startsWith("Key")) return code.substring(3);
  if (code.startsWith("Digit")) return code.substring(5);
  if (code.startsWith("Numpad")) return "Num " + code.substring(6);
  return code;
}

export function formatChord(chord: KeyChord, isApple: boolean = false): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push(isApple ? "⌃" : "Ctrl");
  if (chord.alt) parts.push(isApple ? "⌥" : "Alt");
  if (chord.shift) parts.push(isApple ? "⇧" : "Shift");
  if (chord.meta) parts.push(isApple ? "⌘" : "Win");
  parts.push(formatCode(chord.code));
  return parts.join(isApple ? "" : " + ");
}

export function formatSerializedChord(
  serialized: string,
  isApple: boolean = false,
): string {
  const chord = parseChord(serialized);
  return chord == null ? serialized : formatChord(chord, isApple);
}
