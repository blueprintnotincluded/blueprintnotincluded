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
});
