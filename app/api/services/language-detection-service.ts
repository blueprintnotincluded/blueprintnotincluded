import { detect } from 'tinyld';

// Free, local language detection for Blueprint.description / Comment.body
// (spec/user-content-translation-impl.md §3). Pure function, no I/O, no DB —
// same shape as blueprint-analyzer. Detection failure is never fatal to a
// save: callers wrap this, but detectLanguage itself also never throws.

// Below this many significant characters, short-text detectors guess badly
// (a two-word comment can "detect" as almost anything).
const MIN_SIGNIFICANT_CHARS = 20;

// {{blueprint:<24 hex>}} / {{user:<24 hex>}} reference tokens (comment-body.ts)
const REFERENCE_TOKEN = /\{\{(?:blueprint|user):[0-9a-fA-F]{24}\}\}/g;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s)]+/gi;

// tinyld returns ISO-639-1 already for most languages, but Chinese variants
// and a few macrolanguage codes need collapsing to the site's four locales'
// base languages.
const LANG_ALIASES: Record<string, string> = {
  cmn: 'zh',
  zho: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
};

function normalizeLang(code: string): string {
  const lower = code.toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

// Strips the noise that would otherwise dominate a short body (a comment that
// is mostly a {{blueprint:...}} mention or a stripped URL remnant detects as
// garbage), then counts what's left before bothering to run detection at all.
function significantText(text: string): string {
  return text.replace(REFERENCE_TOKEN, ' ').replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Detects the language of user content. Returns an ISO-639-1 code, or null
 * when the text is too short / low-confidence / detection failed. Never
 * throws — a save must not fail because detection did.
 */
export function detectLanguage(text: string): string | null {
  try {
    const clean = significantText(text);
    if (clean.length < MIN_SIGNIFICANT_CHARS) return null;

    const result = detect(clean);
    if (!result) return null;
    return normalizeLang(result);
  } catch {
    return null;
  }
}
