/**
 * Site theme (the discover skin's palette).
 *
 * Shared because the id is validated in three places that must agree: the
 * backend before it writes the user's account preference, the frontend before
 * it applies a value read from localStorage or the API, and the picker UI that
 * lists them. A palette that exists in CSS but not here cannot be selected, and
 * an id here with no CSS falls back to the default rather than rendering an
 * untokenised page.
 *
 * The id is the value of `data-palette` on <html>; the tokens live in
 * `frontend/src/bni-skin.css`.
 */
export type ThemeId = 'steam' | 'sample-board' | 'film' | 'cyanotype' | 'concrete';

export const THEME_IDS: readonly ThemeId[] = [
  'steam',
  'sample-board',
  'film',
  'cyanotype',
  'concrete',
] as const;

/** Applied to logged-out visitors and to any account that has never chosen. */
export const DEFAULT_THEME_ID: ThemeId = 'steam';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** Never throws: an unknown or absent id resolves to the default. */
export function resolveThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}
