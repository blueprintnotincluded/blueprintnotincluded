import { BuildableElement } from '../b-export/b-element';
import { BniWorldNote } from '../io/bni/bni-blueprint';
export declare const NOTE_ICON_TILE_FRACTION = 0.9;
export declare const NOTE_SYMBOLS: string[];
export declare const DEFAULT_NOTE_SYMBOL = "note_info";
export declare function isKnownNoteSymbol(symbol: string | undefined): boolean;
export declare function resolveNoteSymbol(symbol: string | undefined): string;
export declare function noteSymbolUrl(symbol: string): string;
export type MarkerName = string;
export declare const MARKER_URLS: Record<MarkerName, string>;
export declare function noteBadgeColor(note: BniWorldNote, resolveElement: (tag: number) => BuildableElement | undefined): {
    color: number;
    alpha: number;
};
export declare function parseNoteTintHex(hex: string | undefined): {
    color: number;
    alpha: number;
};
export declare function stripNoteMarkup(text: string): string;
export declare function noteMarkerSprite(note: BniWorldNote, resolveElement: (tag: number) => BuildableElement | undefined): MarkerName;
//# sourceMappingURL=note-markers.d.ts.map