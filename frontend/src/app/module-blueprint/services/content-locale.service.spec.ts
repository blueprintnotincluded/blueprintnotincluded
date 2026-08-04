import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { ContentLocaleService } from "./content-locale.service";

describe("ContentLocaleService", () => {
  let service: ContentLocaleService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        ContentLocaleService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ContentLocaleService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function stubNavigatorLanguage(value: string | undefined) {
    vi.spyOn(navigator, "language", "get").mockReturnValue(value as string);
  }

  describe("initFromLocal", () => {
    it("uses the stored declaration when there is one", () => {
      localStorage.setItem(ContentLocaleService.STORAGE_KEY, "vi");
      service.initFromLocal();
      expect(service.current).toBe("vi");
      expect(service.hasDeclared).toBe(true);
    });

    it("falls back to the browser language as a guess, not a declaration", () => {
      stubNavigatorLanguage("pt-BR");
      service.initFromLocal();
      expect(service.current).toBe("pt");
      expect(service.hasDeclared).toBe(false);
    });

    // A default that writes itself becomes indistinguishable from a choice,
    // which is what would make the "who reads in what language" measurement
    // worthless. Same rule as dlcPreferences.
    it("never persists the browser guess", () => {
      stubNavigatorLanguage("ru");
      service.initFromLocal();
      expect(localStorage.getItem(ContentLocaleService.STORAGE_KEY)).toBe(null);
    });

    // Validation is shape-only and deliberately so — the language set is open,
    // so any plausible 2-3 letter ISO code is accepted without a membership
    // list. What must not survive is something that is not a tag at all.
    it("ignores a stored value that is not a language tag", () => {
      localStorage.setItem(ContentLocaleService.STORAGE_KEY, "12345");
      stubNavigatorLanguage("en-GB");
      service.initFromLocal();
      expect(service.current).toBe("en");
      expect(service.hasDeclared).toBe(false);
    });
  });

  describe("select", () => {
    it("stores the choice locally for an anonymous visitor and makes no request", () => {
      service.select("vi", false);
      expect(service.current).toBe("vi");
      expect(service.hasDeclared).toBe(true);
      expect(localStorage.getItem(ContentLocaleService.STORAGE_KEY)).toBe("vi");
    });

    it("writes the choice to the account when logged in", () => {
      service.select("ko", true);
      const request = http.expectOne("/api/users/me/locale-preference");
      expect(request.request.method).toBe("PATCH");
      expect(request.request.body).toEqual({ locale: "ko" });
      request.flush({ locale: "ko" });
    });

    it("narrows a region tag before storing it", () => {
      service.select("zh-Hans", false);
      expect(service.current).toBe("zh");
    });

    it("ignores a value that is not a language tag", () => {
      service.initFromLocal();
      const before = service.current;
      service.select("javascript:alert(1)", false);
      expect(service.current).toBe(before);
      expect(service.hasDeclared).toBe(false);
    });
  });

  describe("loadForUser", () => {
    it("adopts the account preference when it exists", () => {
      service.initFromLocal();
      service.loadForUser().subscribe();
      http.expectOne("/api/users/me/locale-preference").flush({ locale: "ru" });
      expect(service.current).toBe("ru");
      expect(service.hasDeclared).toBe(true);
      expect(localStorage.getItem(ContentLocaleService.STORAGE_KEY)).toBe("ru");
    });

    // Picking a language before logging in should not have to be done twice.
    it("adopts a local declaration into an account that has none", () => {
      localStorage.setItem(ContentLocaleService.STORAGE_KEY, "vi");
      service.initFromLocal();
      service.loadForUser().subscribe();
      http.expectOne("/api/users/me/locale-preference").flush({ locale: null });

      const write = http.expectOne("/api/users/me/locale-preference");
      expect(write.request.method).toBe("PATCH");
      expect(write.request.body).toEqual({ locale: "vi" });
      write.flush({ locale: "vi" });
    });

    // The mirror image, and the important one: a browser default must never
    // reach the account, or every account acquires a preference nobody set.
    it("does not push a browser guess onto an account with no preference", () => {
      stubNavigatorLanguage("de");
      service.initFromLocal();
      service.loadForUser().subscribe();
      http.expectOne("/api/users/me/locale-preference").flush({ locale: null });
      http.verify(); // no PATCH
      expect(service.hasDeclared).toBe(false);
    });

    // A flaky request must not read as "the account has no preference" — that
    // would let one failed GET push this browser's value over a preference the
    // user set on another device.
    it("keeps the local value when the lookup fails, and writes nothing", () => {
      localStorage.setItem(ContentLocaleService.STORAGE_KEY, "ko");
      service.initFromLocal();
      service.loadForUser().subscribe();
      http
        .expectOne("/api/users/me/locale-preference")
        .flush("nope", { status: 500, statusText: "Server Error" });
      expect(service.current).toBe("ko");
    });
  });

  describe("queryParam / appendToUrl", () => {
    // English sends nothing, so the ordinary browse URL — nearly all traffic —
    // stays byte-identical for the CDN.
    it("sends nothing for an English reader", () => {
      service.select("en", false);
      expect(service.queryParam()).toBe("");
      expect(service.appendToUrl("/api/getblueprints?sort=recent")).toBe(
        "/api/getblueprints?sort=recent",
      );
    });

    it("appends lang with the right separator", () => {
      service.select("vi", false);
      expect(service.appendToUrl("/api/blueprints/abc")).toBe(
        "/api/blueprints/abc?lang=vi",
      );
      expect(service.appendToUrl("/api/getblueprints?sort=recent")).toBe(
        "/api/getblueprints?sort=recent&lang=vi",
      );
    });
  });

  describe("openPicker", () => {
    it("notifies listeners so an ambient control can open the dialog", () => {
      const seen: number[] = [];
      service.openRequests$.subscribe(() => seen.push(1));
      service.openPicker();
      service.openPicker();
      expect(seen.length).toBe(2);
    });
  });

  describe("labelFor", () => {
    it("names a known language and passes an unknown code through", () => {
      expect(service.labelFor("pt")).toBe("Portuguese");
      expect(service.labelFor("xh")).toBe("xh");
      expect(service.labelFor(null)).toBe("");
    });
  });
});
