import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable, Subject, of } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";
import {
  DEFAULT_CONTENT_LOCALE,
  normalizeContentLocale,
  resolveContentLocale,
} from "../../../../../lib/index";

export interface ContentLocaleOption {
  /** Base ISO tag — what gets stored and sent as `?lang=`. */
  code: string;
  /** English name, because the chrome is English (see the service comment). */
  label: string;
  /** The language's own name, so a speaker recognises their row at a glance. */
  endonym: string;
}

/**
 * The languages the picker offers. Deliberately a short, curated list rather
 * than every ISO code: the honest answer to "which languages does this site
 * contain" is the set present in `Blueprint.sourceLang`, and this is that set
 * plus the obvious near misses. An unlisted language is not locked out — the
 * API validates shape, not membership — it just has no row to click yet.
 *
 * Labels stay in English on purpose: this picker chooses a CONTENT language,
 * not a UI language, and translating the control that explains that
 * distinction would be the one place a reader could reasonably expect the rest
 * of the chrome to follow.
 */
export const CONTENT_LOCALE_OPTIONS: readonly ContentLocaleOption[] = [
  { code: "en", label: "English", endonym: "English" },
  { code: "zh", label: "Chinese", endonym: "中文" },
  { code: "ru", label: "Russian", endonym: "Русский" },
  { code: "ko", label: "Korean", endonym: "한국어" },
  { code: "vi", label: "Vietnamese", endonym: "Tiếng Việt" },
  { code: "pt", label: "Portuguese", endonym: "Português" },
  { code: "es", label: "Spanish", endonym: "Español" },
  { code: "fr", label: "French", endonym: "Français" },
  { code: "de", label: "German", endonym: "Deutsch" },
  { code: "ja", label: "Japanese", endonym: "日本語" },
  { code: "pl", label: "Polish", endonym: "Polski" },
  { code: "tr", label: "Turkish", endonym: "Türkçe" },
];

/**
 * Which language the user reads blueprint CONTENT in
 * (spec/search-followups.md Part 2). Not the UI locale — the chrome is
 * English for everyone, so this routes no bundles and prefixes no paths.
 *
 * Three states, and keeping them distinct is the whole design:
 *
 *   - **declared** — the user picked something. Stored in localStorage, and on
 *     the account too when they are logged in.
 *   - **guessed** — nothing declared, so `navigator.language` supplies a
 *     pre-selection. Shown in the picker as the current value but NEVER
 *     persisted: a default that writes itself is indistinguishable from a
 *     choice, which would make the §2.10 "who actually reads in what
 *     language" measurement worthless. Same rule as dlcPreferences.
 *   - **English** — no declaration and no usable browser hint.
 *
 * Only a declaration or a guess that isn't English reaches the wire as
 * `?lang=`; English sends nothing, so the ordinary browse URL — nearly all
 * traffic — stays byte-identical for the CDN.
 */
@Injectable({ providedIn: "root" })
export class ContentLocaleService {
  static readonly STORAGE_KEY = "bpni-content-locale";

  private readonly currentSubject = new BehaviorSubject<string>(
    DEFAULT_CONTENT_LOCALE,
  );
  readonly current$ = this.currentSubject.asObservable();

  /** True once the user has actually chosen, as opposed to being guessed at. */
  private declared = false;

  /**
   * Fired by any control that wants the picker open. The dialog lives in the
   * site nav and listens here, so an ambient entry point (the "translated"
   * marker on a details page, say) needs no component wiring to reach it.
   */
  private readonly openRequests = new Subject<void>();
  readonly openRequests$ = this.openRequests.asObservable();

  readonly options = CONTENT_LOCALE_OPTIONS;

  constructor(private http: HttpClient) {}

  get current(): string {
    return this.currentSubject.value;
  }

  get hasDeclared(): boolean {
    return this.declared;
  }

  /** Called once at app start, before any account state is known. */
  initFromLocal(): void {
    const stored = this.readLocal();
    if (stored != null) {
      this.declared = true;
      this.currentSubject.next(stored);
      return;
    }
    this.currentSubject.next(this.browserDefault());
  }

  /**
   * The browser's language, narrowed to a base tag. A guess, not a choice —
   * see the class comment on why it is never written back.
   */
  browserDefault(): string {
    try {
      return resolveContentLocale(navigator?.language);
    } catch {
      return DEFAULT_CONTENT_LOCALE;
    }
  }

  /**
   * Called when a session is established. The account copy wins if it exists;
   * if it doesn't and this browser has a declaration, the account ADOPTS it —
   * a user who picked a language before logging in should not have to pick it
   * again on the machine they picked it on.
   */
  loadForUser(): Observable<string> {
    return this.http
      .get<{ locale: string | null }>("/api/users/me/locale-preference")
      .pipe(
        // A failed lookup keeps whatever local already applied rather than
        // yanking the reader back to English — and, crucially, is NOT treated
        // as "the account has no preference": adopting on an error would let
        // one flaky request overwrite a preference the user set elsewhere.
        map((res) => ({
          known: true,
          locale: normalizeContentLocale(res.locale),
        })),
        catchError(() => of({ known: false, locale: null as string | null })),
        tap(({ known, locale }) => {
          if (locale != null) {
            this.declared = true;
            this.writeLocal(locale);
            this.currentSubject.next(locale);
            return;
          }
          if (!known) return;
          // Adoption. Guarded on `declared` precisely so a browser default
          // never writes itself onto an account.
          if (this.declared) this.persistToAccount(this.current);
        }),
        map(() => this.current),
      );
  }

  /**
   * The user picked. This is the ONLY path that persists, and it is reached
   * only from a real interaction.
   */
  select(code: string, loggedIn: boolean): void {
    const locale = normalizeContentLocale(code);
    if (locale == null) return;
    this.declared = true;
    this.writeLocal(locale);
    if (this.currentSubject.value !== locale) this.currentSubject.next(locale);
    if (loggedIn) this.persistToAccount(locale);
  }

  /** Ask for the picker (user menu, or the machine-translation disclosure). */
  openPicker(): void {
    this.openRequests.next();
  }

  /**
   * The `lang=` query parameter for a read request, or "" for English —
   * absent means English server-side, and omitting it keeps the common URL
   * stable at the edge.
   */
  queryParam(): string {
    return this.current === DEFAULT_CONTENT_LOCALE
      ? ""
      : `lang=${encodeURIComponent(this.current)}`;
  }

  /** `?lang=…` / `&lang=…` appended to a URL that may already have a query. */
  appendToUrl(url: string): string {
    const param = this.queryParam();
    if (param === "") return url;
    return url + (url.includes("?") ? "&" : "?") + param;
  }

  labelFor(code: string | null | undefined): string {
    const normalized = normalizeContentLocale(code);
    if (normalized == null) return "";
    const option = this.options.find((o) => o.code === normalized);
    return option ? option.label : normalized;
  }

  private persistToAccount(locale: string): void {
    this.http
      .patch("/api/users/me/locale-preference", { locale })
      .subscribe({ error: () => {} });
  }

  private readLocal(): string | null {
    try {
      return normalizeContentLocale(
        localStorage.getItem(ContentLocaleService.STORAGE_KEY),
      );
    } catch {
      return null;
    }
  }

  private writeLocal(locale: string): void {
    try {
      localStorage.setItem(ContentLocaleService.STORAGE_KEY, locale);
    } catch {
      /* private mode — the account copy still carries it */
    }
  }
}
