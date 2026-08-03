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
export type ThemeId = 'steam' | 'sample-board' | 'film' | 'cyanotype' | 'concrete' | 'custom';

export const THEME_IDS: readonly ThemeId[] = [
  'steam',
  'sample-board',
  'film',
  'cyanotype',
  'concrete',
  'custom',
] as const;

/**
 * The palette a user builds by hand. Its id lives in the shared list so the
 * same validation accepts it everywhere, but unlike the prefabs it has no CSS
 * block: the client writes the stored colours into a style rule at runtime.
 */
export const CUSTOM_THEME_ID: ThemeId = 'custom';

/**
 * The hex-valued source tokens a palette sets — the editable slots of a custom
 * theme. Names match the CSS custom properties minus the `--bni-` prefix.
 * The alpha-valued tokens (mark-glow, mark-tint, brass-tint, thumbgrid,
 * board-light) are not listed: the client derives them from their parent hex,
 * so a custom theme is hex-only end to end.
 */
export const THEME_COLOR_TOKENS = [
  'board',
  'board-deep',
  'mount',
  'mount-hi',
  'inset',
  'rule',
  'rule-hi',
  'chip',
  'chip-hi',
  'thumbbg',
  'tag',
  'tag-hi',
  'tag-ink',
  'tag-ink-2',
  'ink',
  'body',
  'muted',
  'faint',
  'mark',
  'mark-hi',
  'mark-dim',
  'brass',
  'danger',
] as const;

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

/** A full or partial set of custom colours; missing tokens fall back to the default palette. */
export type CustomThemeColors = Partial<Record<ThemeColorToken, string>>;

/**
 * Strict six-digit hex only. These values end up in CSS custom properties, so
 * the format is a security boundary, not a convenience: nothing that isn't a
 * literal colour may pass.
 */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

/**
 * Validates a client-supplied custom colour set. Returns the normalised
 * (lowercased) copy, or null when anything is off — an unknown token, a
 * non-hex value, or no valid entries at all. All-or-nothing rather than
 * best-effort: a save that silently dropped half its colours would look like
 * data loss to the user.
 */
export function sanitizeCustomThemeColors(value: unknown): CustomThemeColors | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  const out: CustomThemeColors = {};
  for (const [key, colour] of entries) {
    if (!(THEME_COLOR_TOKENS as readonly string[]).includes(key)) return null;
    if (!isHexColor(colour)) return null;
    out[key as ThemeColorToken] = colour.toLowerCase();
  }
  return out;
}

/** Applied to logged-out visitors and to any account that has never chosen. */
export const DEFAULT_THEME_ID: ThemeId = 'steam';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** Never throws: an unknown or absent id resolves to the default. */
export function resolveThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}
