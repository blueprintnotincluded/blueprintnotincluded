/**
 * Content locale — *which language the user reads blueprint content in*.
 *
 * Deliberately NOT the UI locale. The site's chrome is English-only in
 * production (`localize: false`, and the ru/ko catalogues are ~0% translated),
 * so this preference routes no bundles, prefixes no paths and needs no
 * `hreflang` work. It answers one question: when a blueprint's title exists in
 * more than one language, which one does this reader get?
 * (spec/search-followups.md Part 2.)
 *
 * Shared because the same code is validated in four places that must agree:
 * the `PATCH /api/users/me/locale-preference` endpoint, the value the frontend
 * reads back out of localStorage, the `?lang=` query parameter on the read
 * endpoints, and the picker UI. A value one of them accepts and another
 * rejects shows a reader a title in a language they didn't ask for.
 *
 * The set is OPEN by design (§2.3): a user may declare any language they write
 * and read in — `vi`, `pt`, `fr` — even though English is the only language we
 * ever machine-translate *into*. Declaring a language costs nothing and buys
 * the author their own words back (resolution rule 1); it never obliges the
 * site to produce a translation in that direction.
 */

/** Absent preference, absent `?lang=`, and "we couldn't parse that" all mean English. */
export const DEFAULT_CONTENT_LOCALE = 'en';

// Base tags only. `Blueprint.sourceLang` is written by the detector, which
// collapses everything to a 2-3 letter ISO-639 base code (`zh-Hans` → `zh`),
// and rule 1 of the resolution below is an equality test against it — so a
// region-tagged preference (`pt-BR`) would never match a `pt` document and the
// author would silently lose their own title. Narrowing here rather than at
// each comparison keeps that impossible.
const BASE_TAG = /^[a-z]{2,3}$/;

/**
 * Parses anything (query param, localStorage value, request body, browser
 * `navigator.language`) into a base language tag, or null when it isn't one.
 * Null means "no declaration", which is a different state from `'en'` — a user
 * who never chose must keep resolving to the current default even if that
 * default later changes, which is why nothing writes `'en'` eagerly.
 */
export function normalizeContentLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return BASE_TAG.test(base) ? base : null;
}

/** The locale to actually read in: a declaration if there is one, else English. */
export function resolveContentLocale(value: unknown): string {
  return normalizeContentLocale(value) ?? DEFAULT_CONTENT_LOCALE;
}

/**
 * A title we hold for a blueprint in some language other than the one it was
 * authored in. `origin` distinguishes the author's own words from a machine's:
 * an `authored` entry is not a translation at all (it is the `blueprintsearch`
 * pivot row echoing `Blueprint.name` verbatim) and must never be offered as
 * one, or an English reader would be told an English title was "translated
 * from English".
 */
export interface TitleTranslation {
  lang: string;
  title: string;
  origin: 'authored' | 'machine' | 'human';
}

export interface ResolvedTitle {
  /** What to show. Never empty — the chain always terminates at the authored name. */
  title: string;
  /** The author's own words, always available so the original stays reachable. */
  original: string;
  /**
   * True when `title` is machine output rather than the author's words. The UI
   * MUST disclose this (spec/search-followups.md §2.7): surfacing a machine
   * title unmarked puts words in an author's mouth.
   */
  translated: boolean;
  /** Language the author wrote in, when known — for "Translated from Portuguese". */
  sourceLang: string | null;
}

/**
 * The one resolution rule (spec/search-followups.md §2.5), shared by every
 * response boundary that returns a blueprint title:
 *
 *   1. authored in the viewer's language  -> the author's own words
 *   2. a translation into the viewer's language -> that
 *   3. the English translation            -> that ("readable in English")
 *   4. otherwise                          -> the author's own words
 *
 * Rule 4 is what makes this shippable ahead of any backfill: a blueprint with
 * no translation row, a dropped `blueprintsearch` collection, or a language we
 * have never translated all degrade to the authored title, never to blank.
 *
 * Rule 2 is inert while English is the only translation target, but costs one
 * lookup and keeps the shape honest for whenever a second target is activated.
 */
export function resolveTitle(params: {
  authoredName: string;
  sourceLang: string | null | undefined;
  viewerLang: string;
  translations?: readonly TitleTranslation[];
}): ResolvedTitle {
  const { authoredName, viewerLang } = params;
  const sourceLang = params.sourceLang ?? null;
  const authored: ResolvedTitle = {
    title: authoredName,
    original: authoredName,
    translated: false,
    sourceLang,
  };

  // Rule 1 — they read what the author wrote in. Also the (very common) case
  // of an English reader and an English author, where rules 1 and 3 agree.
  if (sourceLang != null && sourceLang === viewerLang) return authored;

  const usable = (lang: string): TitleTranslation | null => {
    const found = (params.translations ?? []).find(
      t => t.lang === lang && t.origin !== 'authored' && t.title.trim().length > 0
    );
    return found ?? null;
  };

  // Rules 2 and 3. They collapse into one lookup for an English reader, which
  // is every reader who never touched the picker.
  const match = usable(viewerLang) ?? usable(DEFAULT_CONTENT_LOCALE);
  if (match == null) return authored; // Rule 4

  return {
    title: match.title,
    original: authoredName,
    translated: match.origin === 'machine',
    sourceLang,
  };
}
