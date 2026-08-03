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
export declare const THEME_IDS: readonly ThemeId[];
/**
 * The palette a user builds by hand. Its id lives in the shared list so the
 * same validation accepts it everywhere, but unlike the prefabs it has no CSS
 * block: the client writes the stored colours into a style rule at runtime.
 */
export declare const CUSTOM_THEME_ID: ThemeId;
/**
 * The hex-valued source tokens a palette sets — the editable slots of a custom
 * theme. Names match the CSS custom properties minus the `--bni-` prefix.
 * The alpha-valued tokens (mark-glow, mark-tint, brass-tint, thumbgrid,
 * board-light) are not listed: the client derives them from their parent hex,
 * so a custom theme is hex-only end to end.
 */
export declare const THEME_COLOR_TOKENS: readonly ["board", "board-deep", "mount", "mount-hi", "inset", "rule", "rule-hi", "chip", "chip-hi", "thumbbg", "tag", "tag-hi", "tag-ink", "tag-ink-2", "ink", "body", "muted", "faint", "mark", "mark-hi", "mark-dim", "brass", "danger"];
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
/** A full or partial set of custom colours; missing tokens fall back to the default palette. */
export type CustomThemeColors = Partial<Record<ThemeColorToken, string>>;
export declare function isHexColor(value: unknown): value is string;
/**
 * Validates a client-supplied custom colour set. Returns the normalised
 * (lowercased) copy, or null when anything is off — an unknown token, a
 * non-hex value, or no valid entries at all. All-or-nothing rather than
 * best-effort: a save that silently dropped half its colours would look like
 * data loss to the user.
 */
export declare function sanitizeCustomThemeColors(value: unknown): CustomThemeColors | null;
/** Applied to logged-out visitors and to any account that has never chosen. */
export declare const DEFAULT_THEME_ID: ThemeId;
export declare function isThemeId(value: unknown): value is ThemeId;
/** Never throws: an unknown or absent id resolves to the default. */
export declare function resolveThemeId(value: unknown): ThemeId;
//# sourceMappingURL=theme-preference.d.ts.map