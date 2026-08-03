// Text normalization shared by search indexing and query parsing
// (spec/multilingual-search-plan.md §2.4). Pure functions, no I/O.

// Klei rich-text markup carried by export display names:
// <link="WATERPURIFIER">Water Sieve</link>, <style=...>, <color=...> etc.
const KLEI_MARKUP = /<\/?[a-z][^<>]*>/gi;

export function stripKleiMarkup(text: string): string {
  return text.replace(KLEI_MARKUP, '');
}

// Unicode-aware "letter or digit" test via property escapes — \w is
// ASCII-only and would shred any non-English text into single letters.
const NON_WORD = /[^\p{L}\p{N}]+/gu;

/**
 * Canonical form for matching: NFC (so composed/decomposed diacritics
 * compare equal), casefolded, punctuation collapsed to single spaces,
 * trimmed. NOT for display.
 *
 * NFC runs twice: before the punctuation strip (a decomposed combining mark
 * is \p{M}, which NON_WORD would strip off its base letter) and again after
 * toLowerCase, whose mapping can itself emit decomposed sequences (e.g. İ).
 */
export function normalizeText(text: string): string {
  return text.normalize('NFC').toLowerCase().normalize('NFC').replace(NON_WORD, ' ').trim();
}

/** normalizeText, then split into tokens; empty input yields []. */
export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized.length === 0 ? [] : normalized.split(' ');
}
