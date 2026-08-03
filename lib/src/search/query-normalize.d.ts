export declare function stripKleiMarkup(text: string): string;
/**
 * Canonical form for matching: NFC (so composed/decomposed diacritics
 * compare equal), casefolded, punctuation collapsed to single spaces,
 * trimmed. NOT for display.
 *
 * NFC runs twice: before the punctuation strip (a decomposed combining mark
 * is \p{M}, which NON_WORD would strip off its base letter) and again after
 * toLowerCase, whose mapping can itself emit decomposed sequences (e.g. İ).
 */
export declare function normalizeText(text: string): string;
/** normalizeText, then split into tokens; empty input yields []. */
export declare function tokenize(text: string): string[];
//# sourceMappingURL=query-normalize.d.ts.map