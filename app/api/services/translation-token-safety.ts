// Reference-token safety for comment translation (spec/user-content-
// translation-impl.md §4.3). Comment bodies are never raw text — they carry
// {{blueprint:<id>}} / {{user:<id>}} tokens (comment-body.ts) that a machine
// translator will happily mangle or reorder. Before sending: replace each
// token with an opaque, translation-stable placeholder the NMT engine won't
// touch; after: restore. If restoration can't find every placeholder exactly
// once, the translation is discarded — a dropped mention is worse than an
// untranslated comment.
//
// Placeholders are indexed ASCII sentinels (not the token text itself) so an
// NMT engine has no substring resembling natural language to "helpfully"
// translate, reorder relative to punctuation, or merge with adjacent CJK text
// (which has no whitespace to anchor a token boundary).

const REFERENCE_TOKEN = /\{\{(blueprint|user):([0-9a-fA-F]{24})\}\}/g;

function placeholderFor(index: number): string {
  // xxBNIx0xx-style: uppercase+digit runs survive NMT round-trips far better
  // than natural-looking words, and are astronomically unlikely to occur in
  // real user text.
  return `xxBNIREFx${index}xx`;
}

export interface TokenizedText {
  text: string;
  tokens: string[]; // original {{kind:id}} strings, indexed by placeholder
}

export function tokenizeReferences(text: string): TokenizedText {
  const tokens: string[] = [];
  const tokenized = text.replace(REFERENCE_TOKEN, match => {
    const placeholder = placeholderFor(tokens.length);
    tokens.push(match);
    return placeholder;
  });
  return { text: tokenized, tokens };
}

// Restores placeholders in translated text. Returns null when restoration
// fails (missing or duplicated placeholder) — the caller must discard the
// translation rather than serve a corrupted body.
export function restoreReferences(translated: string, tokens: string[]): string | null {
  if (tokens.length === 0) return translated;

  let result = translated;
  for (let i = 0; i < tokens.length; i++) {
    const placeholder = placeholderFor(i);
    const occurrences = result.split(placeholder).length - 1;
    if (occurrences !== 1) return null;
    result = result.replace(placeholder, tokens[i]);
  }
  // Any leftover placeholder-looking sentinel (e.g. the NMT engine duplicated
  // or invented one) means the round-trip isn't trustworthy.
  if (/xxBNIREFx\d+xx/.test(result)) return null;
  return result;
}
