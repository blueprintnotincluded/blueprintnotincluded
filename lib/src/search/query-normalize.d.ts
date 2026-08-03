export declare function stripKleiMarkup(text: string): string;
/**
 * Canonical form for matching: NFC (so composed/decomposed diacritics
 * compare equal), casefolded, punctuation collapsed to single spaces,
 * trimmed. NOT for display.
 */
export declare function normalizeText(text: string): string;
/** normalizeText, then split into tokens; empty input yields []. */
export declare function tokenize(text: string): string[];
//# sourceMappingURL=query-normalize.d.ts.map