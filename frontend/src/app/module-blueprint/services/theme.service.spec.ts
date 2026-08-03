import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { ThemeService } from "./theme.service";

describe("ThemeService", () => {
  let service: ThemeService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-palette");
    document.getElementById("bni-custom-theme")?.remove();

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ThemeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const palette = () => document.documentElement.getAttribute("data-palette");

  it("falls back to the default when nothing is stored", () => {
    service.initFromLocal();
    expect(palette()).toEqual("steam");
    expect(service.current).toEqual("steam");
  });

  it("applies a valid stored theme", () => {
    localStorage.setItem(ThemeService.STORAGE_KEY, "cyanotype");
    service.initFromLocal();
    expect(palette()).toEqual("cyanotype");
  });

  // A stale or hand-edited value must never reach the data-palette attribute.
  it("ignores an unknown stored theme rather than applying it", () => {
    localStorage.setItem(ThemeService.STORAGE_KEY, "'; drop-table --");
    service.initFromLocal();
    expect(palette()).toEqual("steam");
  });

  it("applies and persists a selection for a logged-out visitor without calling the API", () => {
    service.select("film", false);
    expect(palette()).toEqual("film");
    expect(localStorage.getItem(ThemeService.STORAGE_KEY)).toEqual("film");
    http.expectNone("/api/users/me/theme-preference");
  });

  it("persists a logged-in selection to the account", () => {
    service.select("concrete", true);
    const req = http.expectOne("/api/users/me/theme-preference");
    expect(req.request.method).toEqual("PATCH");
    expect(req.request.body).toEqual({ theme: "concrete" });
    req.flush({ theme: "concrete" });
    expect(palette()).toEqual("concrete");
  });

  // The theme is applied optimistically: a failed write costs the cross-device
  // copy, never the choice the user just made.
  it("keeps the applied theme when the account write fails", () => {
    service.select("cyanotype", true);
    const req = http.expectOne("/api/users/me/theme-preference");
    req.flush("nope", { status: 500, statusText: "Server Error" });
    expect(palette()).toEqual("cyanotype");
  });

  it("lets the account theme win over the local one", () => {
    localStorage.setItem(ThemeService.STORAGE_KEY, "film");
    service.initFromLocal();

    service.loadForUser().subscribe();
    http
      .expectOne("/api/users/me/theme-preference")
      .flush({ theme: "sample-board" });

    expect(palette()).toEqual("sample-board");
    expect(localStorage.getItem(ThemeService.STORAGE_KEY)).toEqual(
      "sample-board",
    );
  });

  it("keeps the local theme when the account lookup fails", () => {
    localStorage.setItem(ThemeService.STORAGE_KEY, "film");
    service.initFromLocal();

    service.loadForUser().subscribe();
    http
      .expectOne("/api/users/me/theme-preference")
      .flush("nope", { status: 500, statusText: "Server Error" });

    expect(palette()).toEqual("film");
  });

  it("exposes every theme id the CSS defines", () => {
    const ids = service.themes.map((t) => t.id).sort();
    expect(ids).toEqual(
      ["concrete", "cyanotype", "film", "sample-board", "steam"].sort(),
    );
  });

  describe("custom palette", () => {
    const customRule = (): CSSStyleDeclaration | null => {
      const style = document.getElementById(
        "bni-custom-theme",
      ) as HTMLStyleElement | null;
      const rule = style?.sheet?.cssRules[0] as CSSStyleRule | undefined;
      return rule?.style ?? null;
    };

    it("saves a custom palette: applies it, persists it, and PATCHes the colours", () => {
      const ok = service.saveCustom(
        { board: "#101010", mark: "#FF6A13" },
        true,
      );
      expect(ok).toBe(true);

      expect(palette()).toEqual("custom");
      expect(localStorage.getItem(ThemeService.STORAGE_KEY)).toEqual("custom");
      expect(
        JSON.parse(localStorage.getItem(ThemeService.CUSTOM_STORAGE_KEY)!),
      ).toEqual({ board: "#101010", mark: "#ff6a13" });

      const rule = customRule()!;
      expect(rule.getPropertyValue("--bni-board")).toEqual("#101010");
      // Derived alpha tokens come from the parent hex.
      expect(rule.getPropertyValue("--bni-mark-glow")).toEqual(
        "rgba(255, 106, 19, 0.35)",
      );

      const req = http.expectOne("/api/users/me/theme-preference");
      expect(req.request.method).toEqual("PATCH");
      expect(req.request.body).toEqual({
        theme: "custom",
        customColors: { board: "#101010", mark: "#ff6a13" },
      });
      req.flush({ theme: "custom" });
    });

    it("refuses to save anything that is not strict hex on a known token", () => {
      expect(service.saveCustom({ board: "red" } as any, false)).toBe(false);
      expect(service.saveCustom({ nope: "#123456" } as any, false)).toBe(false);
      expect(palette()).toBeNull();
      http.expectNone("/api/users/me/theme-preference");
    });

    it("previews without committing, and revertPreview restores the real theme", () => {
      service.select("film", false);
      service.previewCustom({ board: "#222222" });
      expect(palette()).toEqual("custom");
      // Nothing persisted by a preview.
      expect(localStorage.getItem(ThemeService.STORAGE_KEY)).toEqual("film");

      service.revertPreview();
      expect(palette()).toEqual("film");
    });

    it("restores a stored custom theme on init", () => {
      localStorage.setItem(ThemeService.STORAGE_KEY, "custom");
      localStorage.setItem(
        ThemeService.CUSTOM_STORAGE_KEY,
        JSON.stringify({ board: "#0a0b0c" }),
      );
      service.initFromLocal();
      expect(palette()).toEqual("custom");
      expect(customRule()!.getPropertyValue("--bni-board")).toEqual("#0a0b0c");
    });

    // A "custom" id with no colour set would render the untokenised default
    // block anyway; resolve it honestly instead.
    it("falls back to the default when custom is stored without colours", () => {
      localStorage.setItem(ThemeService.STORAGE_KEY, "custom");
      service.initFromLocal();
      expect(palette()).toEqual("steam");
    });

    it("selecting custom without a saved set is a no-op", () => {
      service.initFromLocal();
      service.select("custom", true);
      expect(palette()).toEqual("steam");
      http.expectNone("/api/users/me/theme-preference");
    });

    it("applies the account's custom theme from loadForUser", () => {
      service.initFromLocal();
      service.loadForUser().subscribe();
      http.expectOne("/api/users/me/theme-preference").flush({
        theme: "custom",
        customColors: { board: "#123456", mark: "#654321" },
      });

      expect(palette()).toEqual("custom");
      expect(service.customColors).toEqual({
        board: "#123456",
        mark: "#654321",
      });
      expect(
        JSON.parse(localStorage.getItem(ThemeService.CUSTOM_STORAGE_KEY)!),
      ).toEqual({ board: "#123456", mark: "#654321" });
    });

    it("ignores malformed colours arriving from the account copy", () => {
      service.initFromLocal();
      service.loadForUser().subscribe();
      http.expectOne("/api/users/me/theme-preference").flush({
        theme: "custom",
        customColors: { board: "url(javascript:1)" },
      });
      // Colours rejected → no set → custom resolves to the default.
      expect(palette()).toEqual("steam");
    });
  });
});
