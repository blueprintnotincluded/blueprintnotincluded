import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable, of } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";
import {
  ThemeId,
  ThemeColorToken,
  CustomThemeColors,
  DEFAULT_THEME_ID,
  CUSTOM_THEME_ID,
  THEME_COLOR_TOKENS,
  resolveThemeId,
  sanitizeCustomThemeColors,
} from "../../../../../lib/index";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  note: string;
  /** board, tag, mark — the three colours the swatch shows */
  swatch: [string, string, string];
}

/**
 * The alpha-valued tokens every palette also sets, derived here from their
 * parent hex so a custom theme stays hex-only: [derived token, parent, alpha].
 * Ratios match what the prefab palettes use.
 */
const DERIVED_ALPHA_TOKENS: readonly [string, ThemeColorToken, number][] = [
  ["mark-glow", "mark", 0.35],
  ["mark-tint", "mark", 0.1],
  ["brass-tint", "brass", 0.16],
  ["thumbgrid", "tag", 0.3],
  ["board-light", "tag", 0.055],
];

/**
 * Applies the chosen palette by setting `data-palette` on <html>; the tokens
 * live in bni-skin.css. A custom palette has no CSS block: its colours are
 * written into an injected style rule via CSSStyleDeclaration.setProperty —
 * never by string-building CSS — after strict hex validation, because the
 * values come from storage.
 *
 * Resolution order is preference > local > default. localStorage is written for
 * everyone, including logged-in users: it is what stops the page flashing the
 * default theme on the next load while the account preference is still in
 * flight. The account copy is what makes the choice follow you to another
 * machine, and it wins whenever it arrives.
 */
@Injectable({ providedIn: "root" })
export class ThemeService {
  static readonly STORAGE_KEY = "bpni-theme";
  static readonly CUSTOM_STORAGE_KEY = "bpni-theme-custom";

  private readonly currentSubject = new BehaviorSubject<ThemeId>(
    DEFAULT_THEME_ID,
  );
  readonly current$ = this.currentSubject.asObservable();

  /** The saved custom colour set, if the user has ever built one. */
  private committedCustomColors: CustomThemeColors | null = null;

  private customRule: CSSStyleDeclaration | null = null;

  /** The prefab palettes; the custom option is rendered separately by the UI. */
  readonly themes: ThemeOption[] = [
    {
      id: "steam",
      label: "Workshop",
      note: "Cool near-black with a signal blue. The default.",
      swatch: ["#1b1d21", "#d6dde4", "#1a9fff"],
    },
    {
      id: "film",
      label: "Drafting Film",
      note: "Neutral greys and safety orange.",
      swatch: ["#22262a", "#dfe4e8", "#ff6a13"],
    },
    {
      id: "cyanotype",
      label: "Cyanotype",
      note: "Deep Prussian blue with a warm amber mark.",
      swatch: ["#101f2e", "#eef2f5", "#f0a92c"],
    },
    {
      id: "concrete",
      label: "Concrete",
      note: "Cool grey with a signal green.",
      swatch: ["#2c2f33", "#f0f0ee", "#3f9b6d"],
    },
    {
      id: "sample-board",
      label: "Sample Board",
      note: "Warm charcoal, bone tag, china-pencil red.",
      swatch: ["#201e1a", "#e6e0d2", "#cc4126"],
    },
  ];

  constructor(private http: HttpClient) {}

  get current(): ThemeId {
    return this.currentSubject.value;
  }

  get customColors(): CustomThemeColors | null {
    return this.committedCustomColors;
  }

  /** Called once at app start, before any account state is known. */
  initFromLocal(): void {
    this.committedCustomColors = this.readCustomLocal();
    this.apply(this.readLocal() ?? DEFAULT_THEME_ID);
  }

  /** Called when a session is established; the account copy wins if it exists. */
  loadForUser(): Observable<ThemeId> {
    return this.http
      .get<{ theme: string; customColors?: unknown }>(
        "/api/users/me/theme-preference",
      )
      .pipe(
        // A failed lookup keeps whatever local already applied rather than
        // yanking the page back to the default.
        catchError(() =>
          of({
            theme: this.current,
            customColors: this.committedCustomColors ?? undefined,
          }),
        ),
        map((res) => {
          const colors = sanitizeCustomThemeColors(res.customColors);
          if (colors) {
            this.committedCustomColors = colors;
            this.writeCustomLocal(colors);
          }
          return resolveThemeId(res.theme);
        }),
        tap((id) => {
          this.apply(id);
          this.writeLocal(id);
        }),
      );
  }

  /**
   * Applies immediately and persists in the background. The UI never waits on
   * the network to repaint — a failed write costs the user the cross-device
   * copy, not the theme they just picked.
   */
  select(id: ThemeId, loggedIn: boolean): void {
    // "custom" is only selectable once a colour set exists.
    if (id === CUSTOM_THEME_ID && !this.committedCustomColors) return;
    this.apply(id);
    this.writeLocal(id);
    if (!loggedIn) return;
    this.http
      .patch("/api/users/me/theme-preference", { theme: id })
      .subscribe({ error: () => {} });
  }

  /**
   * Commits a hand-picked palette: validates, applies, and persists it as the
   * current theme. Same optimistic contract as select().
   */
  saveCustom(colors: CustomThemeColors, loggedIn: boolean): boolean {
    const clean = sanitizeCustomThemeColors(colors);
    if (!clean) return false;
    this.committedCustomColors = clean;
    this.writeCustomLocal(clean);
    this.apply(CUSTOM_THEME_ID);
    this.writeLocal(CUSTOM_THEME_ID);
    if (loggedIn) {
      this.http
        .patch("/api/users/me/theme-preference", {
          theme: CUSTOM_THEME_ID,
          customColors: clean,
        })
        .subscribe({ error: () => {} });
    }
    return true;
  }

  /**
   * Shows a colour set on the live page without committing anything — the
   * editor calls this on every picker change. revertPreview() restores the
   * committed theme (used when the dialog closes without saving).
   */
  previewCustom(colors: CustomThemeColors): void {
    const clean = sanitizeCustomThemeColors(colors);
    if (!clean) return;
    this.writeCustomRule(clean);
    document.documentElement.setAttribute("data-palette", CUSTOM_THEME_ID);
  }

  revertPreview(): void {
    this.apply(this.currentSubject.value);
  }

  /**
   * The starting point for the custom editor: the token values of whatever
   * palette the page is currently wearing, read from the computed styles so
   * the CSS stays the single source of truth for the prefabs.
   */
  seedColorsFromCurrent(): CustomThemeColors {
    const probe = document.createElement("div");
    probe.className = "bni-skin";
    probe.style.display = "none";
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe);
    const out: CustomThemeColors = {};
    for (const token of THEME_COLOR_TOKENS) {
      const value = computed.getPropertyValue(`--bni-${token}`).trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) out[token] = value.toLowerCase();
    }
    probe.remove();
    return out;
  }

  private apply(id: ThemeId): void {
    let resolved = resolveThemeId(id);
    if (resolved === CUSTOM_THEME_ID) {
      if (!this.committedCustomColors) resolved = DEFAULT_THEME_ID;
      else this.writeCustomRule(this.committedCustomColors);
    }
    document.documentElement.setAttribute("data-palette", resolved);
    if (resolved !== this.currentSubject.value)
      this.currentSubject.next(resolved);
  }

  /**
   * Populates the injected `:root[data-palette="custom"] .bni-skin` rule.
   * Values are set one property at a time on the rule's style declaration —
   * setProperty parses, so nothing but a colour can take effect — and every
   * value has already passed the strict hex check.
   */
  private writeCustomRule(colors: CustomThemeColors): void {
    const rule = this.ensureCustomRule();
    if (!rule) return;
    for (const token of THEME_COLOR_TOKENS) {
      const hex = colors[token];
      if (hex) rule.setProperty(`--bni-${token}`, hex);
      else rule.removeProperty(`--bni-${token}`);
    }
    for (const [derived, parent, alpha] of DERIVED_ALPHA_TOKENS) {
      const hex = colors[parent];
      if (hex) rule.setProperty(`--bni-${derived}`, hexToRgba(hex, alpha));
      else rule.removeProperty(`--bni-${derived}`);
    }
  }

  private ensureCustomRule(): CSSStyleDeclaration | null {
    if (this.customRule) return this.customRule;
    try {
      const style = document.createElement("style");
      style.id = "bni-custom-theme";
      document.head.appendChild(style);
      const sheet = style.sheet as CSSStyleSheet;
      const index = sheet.insertRule(
        ':root[data-palette="custom"] .bni-skin {}',
        0,
      );
      this.customRule = (sheet.cssRules[index] as CSSStyleRule).style;
      return this.customRule;
    } catch {
      return null;
    }
  }

  private readLocal(): ThemeId | null {
    try {
      const v = localStorage.getItem(ThemeService.STORAGE_KEY);
      return v ? resolveThemeId(v) : null;
    } catch {
      return null;
    }
  }

  private writeLocal(id: ThemeId): void {
    try {
      localStorage.setItem(ThemeService.STORAGE_KEY, id);
    } catch {
      /* private mode — the account copy still carries it */
    }
  }

  private readCustomLocal(): CustomThemeColors | null {
    try {
      const raw = localStorage.getItem(ThemeService.CUSTOM_STORAGE_KEY);
      return raw ? sanitizeCustomThemeColors(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private writeCustomLocal(colors: CustomThemeColors): void {
    try {
      localStorage.setItem(
        ThemeService.CUSTOM_STORAGE_KEY,
        JSON.stringify(colors),
      );
    } catch {
      /* private mode — the account copy still carries it */
    }
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
