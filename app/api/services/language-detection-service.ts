import { detectAll } from 'tinyld';

// Free, local language detection for user content (blueprint titles and
// descriptions, comment bodies). Pure function, no I/O, no DB — same shape as
// blueprint-analyzer. Detection failure is never fatal to a save: callers
// wrap this, but detectLanguage itself also never throws.
//
// Contract (spec/multilingual-search-plan.md §2.4): statistical detection
// alone cannot handle the short texts that dominate this site (~21-char
// titles, few-word queries), so callers may supply a *prior* — typically the
// author's UI locale — and the result records whether the answer came from
// statistics ('high') or from that prior ('prior'). That provenance lets the
// caller decide whether the language is trustworthy enough to spend a
// translation on.

// At or above this many significant characters, the statistical detector is
// trusted on the usual relative-margin rule alone.
const MIN_SIGNIFICANT_CHARS = 20;

// {{blueprint:<24 hex>}} / {{user:<24 hex>}} reference tokens (comment-body.ts)
const REFERENCE_TOKEN = /\{\{(?:blueprint|user):[0-9a-fA-F]{24}\}\}/g;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s)]+/gi;

// tinyld returns ISO-639-1 already for most languages, but Chinese variants
// and a few macrolanguage codes need collapsing to base languages.
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

// tinyld's `accuracy` is a relative probability spread across its full
// language set (600+ entries including conlangs), so a real match on an
// ambiguous Latin-script text can legitimately score as low as ~0.05-0.1 —
// an absolute floor would reject correct French/Spanish/etc. detections
// wholesale. A relative margin over the runner-up is the signal that
// actually distinguishes "one clear match" from "a coin flip between two
// candidates", without penalizing scripts (CJK/Cyrillic/Korean) that tinyld
// is unambiguous about.
const MIN_CONFIDENCE_MARGIN = 1.15;

// Below MIN_SIGNIFICANT_CHARS the margin rule alone is a coin flip for plain
// Latin text ("New Base" scores as several languages at once), so a short
// text is trusted only when it BOTH clears a much stronger margin and
// carries at least one character outside unaccented ASCII — CJK, Hangul,
// Cyrillic, or accented Latin (Vietnamese diacritics, French accents…). A
// short all-ASCII text can never be statistically 'high'; it falls to the
// prior.
const SHORT_TEXT_MARGIN = 2.0;
// eslint-disable-next-line no-control-regex
const NON_ASCII = /[^\x00-\x7F]/;

export interface LanguageDetection {
  lang: string | null;
  // 'high'  — statistical detection, confident; safe to store and act on.
  // 'prior' — statistics couldn't decide, answer is the caller's prior;
  //           store it if useful, but think before spending money on it.
  // 'none'  — no statistics, no prior: nothing is known.
  confidence: 'high' | 'prior' | 'none';
}

export interface DetectLanguageOptions {
  // Best guess from context — typically the author's UI locale. Used only
  // when statistical detection is not confident.
  prior?: string | null;
}

export function detectLanguage(text: string, options?: DetectLanguageOptions): LanguageDetection {
  const prior = options?.prior != null ? normalizeLang(options.prior) : null;
  const fallback: LanguageDetection =
    prior != null ? { lang: prior, confidence: 'prior' } : { lang: null, confidence: 'none' };

  try {
    const clean = significantText(text);
    if (clean.length === 0) return fallback;

    const candidates = detectAll(clean);
    if (candidates.length === 0) return fallback;
    const [top, runnerUp] = candidates;

    const margin = clean.length >= MIN_SIGNIFICANT_CHARS ? MIN_CONFIDENCE_MARGIN : SHORT_TEXT_MARGIN;
    const confident =
      (runnerUp == null || top.accuracy >= runnerUp.accuracy * margin) &&
      (clean.length >= MIN_SIGNIFICANT_CHARS || NON_ASCII.test(clean));

    if (!confident) return fallback;
    return { lang: normalizeLang(top.lang), confidence: 'high' };
  } catch {
    return fallback;
  }
}

// Convenience for callers that only want a confidently detected code (the
// pre-prior contract): 'high' yields the code, anything else null.
export function detectLanguageCode(text: string): string | null {
  const result = detectLanguage(text);
  return result.confidence === 'high' ? result.lang : null;
}
