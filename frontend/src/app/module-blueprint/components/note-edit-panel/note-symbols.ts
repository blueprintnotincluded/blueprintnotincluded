// The icons a text note can carry, mirroring the mod's `textnote_icons` asset
// folder. The id IS the sprite/file name, because that is literally what the
// mod stores in `BlueprintNoteData.Symbol` and matches back on load — so these
// strings are wire values, not display keys, and must not be renamed.
//
// Ordered for the picker (meaning first, then digits), not by filename.
export const NOTE_SYMBOLS: string[] = [
  "note_info",
  "note_warn",
  "note_question",
  "note_num_0",
  "note_num_1",
  "note_num_2",
  "note_num_3",
  "note_num_4",
  "note_num_5",
  "note_num_6",
  "note_num_7",
  "note_num_8",
  "note_num_9",
];

// What an empty/absent symbol renders and selects as. The mod's default note
// sprite is byte-identical to `note_info`, so treating them as one choice is
// truthful and keeps two visually identical swatches out of the picker.
export const DEFAULT_NOTE_SYMBOL = "note_info";

const SYMBOL_SET = new Set(NOTE_SYMBOLS);

// A symbol we don't ship art for (a newer mod build, a hand-edited blueprint)
// falls back to the default rather than rendering nothing — same rule the mod
// applies in GetNoteSprite.
export function isKnownNoteSymbol(symbol: string | undefined): boolean {
  return symbol != null && SYMBOL_SET.has(symbol);
}

// Which swatch a note's stored symbol corresponds to in the picker. Empty and
// unrecognised both collapse to the default, so the picker always shows one
// selection and the user is never stuck on an icon they can't see.
export function resolveNoteSymbol(symbol: string | undefined): string {
  return isKnownNoteSymbol(symbol) ? symbol! : DEFAULT_NOTE_SYMBOL;
}

export function noteSymbolUrl(symbol: string): string {
  return "assets/images/notes/symbols/" + symbol + ".png";
}
