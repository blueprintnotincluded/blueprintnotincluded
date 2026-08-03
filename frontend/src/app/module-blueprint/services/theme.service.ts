import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable, of } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";
import {
  ThemeId,
  DEFAULT_THEME_ID,
  resolveThemeId,
} from "../../../../../lib/index";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  note: string;
  /** board, tag, mark — the three colours the swatch shows */
  swatch: [string, string, string];
}

/**
 * Applies the chosen palette by setting `data-palette` on <html>; the tokens
 * live in bni-skin.css.
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

  private readonly currentSubject = new BehaviorSubject<ThemeId>(
    DEFAULT_THEME_ID,
  );
  readonly current$ = this.currentSubject.asObservable();

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

  /** Called once at app start, before any account state is known. */
  initFromLocal(): void {
    this.apply(this.readLocal() ?? DEFAULT_THEME_ID);
  }

  /** Called when a session is established; the account copy wins if it exists. */
  loadForUser(): Observable<ThemeId> {
    return this.http
      .get<{ theme: string }>("/api/users/me/theme-preference")
      .pipe(
        // A failed lookup keeps whatever local already applied rather than
        // yanking the page back to the default.
        catchError(() => of({ theme: this.current })),
        map((res) => resolveThemeId(res.theme)),
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
    this.apply(id);
    this.writeLocal(id);
    if (!loggedIn) return;
    this.http
      .patch("/api/users/me/theme-preference", { theme: id })
      .subscribe({ error: () => {} });
  }

  private apply(id: ThemeId): void {
    const resolved = resolveThemeId(id);
    document.documentElement.setAttribute("data-palette", resolved);
    if (resolved !== this.currentSubject.value)
      this.currentSubject.next(resolved);
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
}
