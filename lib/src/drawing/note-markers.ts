import { BniWorldNote } from '../io/bni/bni-blueprint';
import { BuildableElement } from '../b-export/b-element';
import { ElementState } from '../enums/element-state';

// How a world note becomes a marker on the canvas: which sprite, what colour,
// how big. Pure and renderer-agnostic, because three renderers need the same
// answers — the editor overlay, the client-side export/thumbnail snapshots,
// and the server-side preview worker (which runs node PIXI in a child
// process and shares nothing else with the frontend).

// The mod's `BlueprintNoteData.NoteType`.
const TEXT_NOTE = 0;

// Fallback badge colour for element notes whose element/uiColor we can't
// resolve, and for any text note missing a usable tint.
const DEFAULT_BADGE_COLOR = 0x3b82f6;

// Markers fill most (not all) of their cell so adjacent notes stay legible
// (spec §5). The art the mod ships is its *placer tool* icon set, framed with
// selection brackets; that frame is stripped from our copies (it read as a
// stray border on the blueprint) and each glyph normalized to the same content
// box, so all four markers carry the same visual weight at this size.
export const NOTE_ICON_TILE_FRACTION = 0.9;

// The icons a text note can carry, mirroring the mod's `textnote_icons` asset
// folder. The id IS the sprite/file name, because that is literally what the
// mod stores in `BlueprintNoteData.Symbol` and matches back on load — so these
// strings are wire values, not display keys, and must not be renamed.
//
// Ordered for the picker (meaning first, then digits), not by filename.
export const NOTE_SYMBOLS: string[] = [
  'note_info',
  'note_warn',
  'note_question',
  'note_num_0',
  'note_num_1',
  'note_num_2',
  'note_num_3',
  'note_num_4',
  'note_num_5',
  'note_num_6',
  'note_num_7',
  'note_num_8',
  'note_num_9',
];

// What an empty/absent symbol renders and selects as. The mod's default note
// sprite is byte-identical to `note_info`, so treating them as one choice is
// truthful and keeps two visually identical swatches out of the picker.
export const DEFAULT_NOTE_SYMBOL = 'note_info';

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
  return 'assets/images/notes/symbols/' + symbol + '.png';
}

// "note" plus the element states are the built-in markers; a text note can
// additionally name any icon from NOTE_SYMBOLS, which is why this is a plain
// string keyed into MARKER_URLS rather than a closed union.
export type MarkerName = string;

// Asset urls, relative to whichever root the renderer resolves against: the
// browser's served `assets/`, or the worker's on-disk frontend build.
export const MARKER_URLS: Record<MarkerName, string> = {
  note: 'assets/images/notes/note.png',
  solid: 'assets/images/notes/solid.png',
  liquid: 'assets/images/notes/liquid.png',
  gas: 'assets/images/notes/gas.png',
  ...Object.fromEntries(NOTE_SYMBOLS.map(s => [s, noteSymbolUrl(s)])),
};

// Badge colour (PIXI int + alpha) for a note: text notes use their tint,
// element notes use the resolved element's uiColor. Element lookup is injected
// so this stays pure and unit-testable.
export function noteBadgeColor(
  note: BniWorldNote,
  resolveElement: (tag: number) => BuildableElement | undefined
): { color: number; alpha: number } {
  if (note.type === TEXT_NOTE) return parseNoteTintHex(note.tinthex);
  const element = note.id != null ? resolveElement(note.id) : undefined;
  return {
    color: element != null && element.uiColor ? element.uiColor : DEFAULT_BADGE_COLOR,
    alpha: 1,
  };
}

// "RRGGBBAA" (the mod's Color.ToHexString) -> PIXI colour + alpha. Anything
// unparseable falls back to the default badge colour, fully opaque.
export function parseNoteTintHex(hex: string | undefined): {
  color: number;
  alpha: number;
} {
  if (hex == null || !/^(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex))
    return { color: DEFAULT_BADGE_COLOR, alpha: 1 };
  const color = parseInt(hex.slice(0, 6), 16);
  const alpha = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { color, alpha };
}

// ONI stores rich-text markup in note strings (spec §7 gotcha 2); strip it
// before showing, and collapse whitespace.
export function stripNoteMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Which marker sprite a note renders as (spec §4 table). Text notes use the
// icon they name, if we ship it. Element notes pick the sprite for the
// resolved element's state; unresolved elements and Vacuum fall back to the
// plain note marker, same as the default badge colour they also get from
// noteBadgeColor.
export function noteMarkerSprite(
  note: BniWorldNote,
  resolveElement: (tag: number) => BuildableElement | undefined
): MarkerName {
  if (note.type === TEXT_NOTE) return isKnownNoteSymbol(note.symbol) ? note.symbol! : 'note';
  const element = note.id != null ? resolveElement(note.id) : undefined;
  if (element == null) return 'note';
  switch (element.state) {
    case ElementState.Solid:
      return 'solid';
    case ElementState.Liquid:
      return 'liquid';
    case ElementState.Gas:
      return 'gas';
    default:
      return 'note';
  }
}
