// Blueprint title policy — shared by the save dialog (client-side validation),
// the upload endpoint, and the Mongoose schema, so all three agree on exactly
// one definition of a legal title.
//
// Titles used to be `/^[a-zA-Z0-9_ -]+$/`, which rejected every non-English
// title at save. Titles are also the site's entire searchable corpus
// (spec/multilingual-search-plan.md §0), so ASCII-only titles meant non-English
// builds were unstorable, not merely unfindable.
//
// The replacement is not "allow everything". It is: allow every script a real
// title is written in, and reject the characters whose only use in a 60-char
// display string is to deceive or to break rendering. The list below is
// deliberately narrow — every rule has to survive the test "does this reject a
// legitimate Chinese, Russian, Korean or Vietnamese title?".

/** Max title length, in UTF-16 code units — the unit Mongoose's maxlength counts. */
export const MAX_BLUEPRINT_NAME_LENGTH = 60;

export type BlueprintNameRejection =
  'empty' | 'too-long' | 'control' | 'invisible' | 'stacked-marks' | 'mixed-script';

export type BlueprintNameResult =
  { ok: true; name: string } | { ok: false; reason: BlueprintNameRejection; message: string };

// Anything that renders as horizontal space becomes a plain U+0020 before
// validation: a title separated by NBSP or an ideographic space looks identical
// to one separated by a space, so storing both forms would make two titles the
// user cannot tell apart (and, via the {owner, name} check, two documents).
const WHITESPACE = /[\t\n\v\f\r\u0085\u2028\u2029\p{Zs}]+/gu;

// Cc = C0/C1 controls. Nothing survives the whitespace pass except characters
// with no rendering at all (NUL, BEL, …), which have no business in a title.
const CONTROL = /\p{Cc}/u;

// Cf = format characters. This is the whole bidi-override spoofing family
// (U+202A…U+202E, U+2066…U+2069), the invisible joiners, and U+FEFF. Two are
// exempt because scripts genuinely need them: ZWNJ (U+200C) and ZWJ (U+200D)
// carry meaning in Persian/Arabic/Indic text and hold emoji sequences together.
// Cn (unassigned), Co (private use) and Cs (lone surrogate) render as tofu or
// worse and cannot be typed deliberately by a legitimate author.
const INVISIBLE = /[\p{Cf}\p{Cn}\p{Co}\p{Cs}]/u;
// ZWNJ / ZWJ, written as escapes because they are invisible in a file read.
const ALLOWED_FORMAT_G = /[\u200c\u200d]/gu;

// "Zalgo": combining marks stacked far past what any orthography uses, which
// overflows the line box and makes neighbouring UI unreadable. Vietnamese —
// the densest legitimate case — stacks at most two marks on a base letter.
const MAX_COMBINING_RUN = 4;
const COMBINING_RUN = new RegExp(`\\p{M}{${MAX_COMBINING_RUN + 1},}`, 'u');

// Confusable policy, deliberately minimal. The homoglyph attack that matters
// here is a title that reads as ASCII but isn't — "Rоdriguez" with a Cyrillic
// о, impersonating a known build. That attack requires Latin and Cyrillic (or
// Greek) letters inside a single *word*, so that is the only thing rejected.
//
// Everything else mixes freely: "SPOM 电解" (Latin word + Han word) passes,
// Japanese Han+Kana within one word passes, and any single-script word passes
// no matter which script it is. Restricting mixing more broadly — e.g. UTS #39
// "moderately restrictive" applied to the whole string — would reject the very
// common "英文 name + English model number" titles this change exists to allow.
const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const GREEK = /\p{Script=Greek}/u;

const MESSAGES: Record<BlueprintNameRejection, string> = {
  empty: 'Blueprint name is required',
  'too-long': `Blueprint name must be ${MAX_BLUEPRINT_NAME_LENGTH} characters or fewer`,
  control: 'Blueprint name may not contain control characters',
  invisible: 'Blueprint name may not contain invisible or direction-changing characters',
  'stacked-marks': 'Blueprint name has too many stacked accent marks',
  'mixed-script':
    'Blueprint name mixes Latin with Cyrillic or Greek letters inside one word, which is used to imitate other names. Write each word in a single alphabet.',
};

/**
 * Canonical stored form: NFC, every kind of whitespace collapsed to single
 * spaces, trimmed. Idempotent — normalizing a normalized name is a no-op,
 * which is what lets the schema validator insist on the canonical form.
 *
 * NFC (not NFD) so that a title typed on macOS, which hands over decomposed
 * text, is byte-equal to the same title typed on Windows. The {owner, name}
 * duplicate check is an exact string match, so without this a user could not
 * overwrite their own blueprint from a different machine.
 */
export function normalizeBlueprintName(raw: string): string {
  return raw.normalize('NFC').replace(WHITESPACE, ' ').trim();
}

function hasMixedConfusableScripts(name: string): boolean {
  for (const word of name.split(' ')) {
    let scripts = 0;
    if (LATIN.test(word)) scripts++;
    if (CYRILLIC.test(word)) scripts++;
    if (GREEK.test(word)) scripts++;
    if (scripts > 1) return true;
  }
  return false;
}

/**
 * Validate an already-normalized name. Callers that accept user input should
 * go through `validateBlueprintName`, which normalizes first; this is the form
 * the schema enforces, so that stored titles are always canonical.
 */
export function checkNormalizedBlueprintName(name: string): BlueprintNameResult {
  if (name.length === 0) return reject('empty');
  if (name.length > MAX_BLUEPRINT_NAME_LENGTH) return reject('too-long');
  if (CONTROL.test(name)) return reject('control');
  if (INVISIBLE.test(name.replace(ALLOWED_FORMAT_G, ''))) return reject('invisible');
  if (COMBINING_RUN.test(name)) return reject('stacked-marks');
  if (hasMixedConfusableScripts(name)) return reject('mixed-script');
  return { ok: true, name };
}

/** Normalize, then validate. The name in a successful result is what to store. */
export function validateBlueprintName(raw: unknown): BlueprintNameResult {
  if (typeof raw !== 'string') return reject('empty');
  return checkNormalizedBlueprintName(normalizeBlueprintName(raw));
}

/** True only for the exact canonical form of a legal name — the schema's test. */
export function isCanonicalBlueprintName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (normalizeBlueprintName(value) !== value) return false;
  return checkNormalizedBlueprintName(value).ok;
}

function reject(reason: BlueprintNameRejection): BlueprintNameResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}
