import { TestBed } from "@angular/core/testing";
import { LOCALE_ID } from "@angular/core";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

import { TranslationService } from "./translation.service";
import { AuthenticationService } from "./authentification-service";

describe("TranslationService", () => {
  let httpMock: HttpTestingController;
  let mockAuth: any;

  function makeService(locale: string): TranslationService {
    TestBed.configureTestingModule({
      providers: [
        TranslationService,
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: LOCALE_ID, useValue: locale },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    const service = TestBed.inject(TranslationService);
    httpMock = TestBed.inject(HttpTestingController);
    return service;
  }

  beforeEach(() => {
    mockAuth = {
      getToken: vi.fn().mockReturnValue("test-jwt"),
      isLoggedIn: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe("viewerLang", () => {
    it("maps en-US to en", () => {
      expect(makeService("en-US").viewerLang).toBe("en");
    });

    it("passes zh-Hans, ru, ko through unchanged", () => {
      expect(makeService("zh-Hans").viewerLang).toBe("zh-Hans");
    });

    it("falls back to en for an unrecognized locale", () => {
      expect(makeService("fr").viewerLang).toBe("en");
    });
  });

  describe("matchesViewerLang", () => {
    it("collapses zh-Hans to zh for the comparison", () => {
      const service = makeService("zh-Hans");
      expect(service.matchesViewerLang("zh")).toBe(true);
      expect(service.matchesViewerLang("en")).toBe(false);
    });

    it("compares directly for en/ru/ko", () => {
      const service = makeService("ru");
      expect(service.matchesViewerLang("ru")).toBe(true);
      expect(service.matchesViewerLang("en")).toBe(false);
    });
  });

  describe("translateBlueprint", () => {
    it("posts the viewer's language and caches the result in-memory", () => {
      const service = makeService("en-US");
      let first: any;
      service.translateBlueprint("bp1").subscribe((r) => (first = r));

      const req = httpMock.expectOne("/api/blueprints/bp1/translate");
      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual({ lang: "en" });
      expect(req.request.headers.get("Authorization")).toBe("Bearer test-jwt");
      req.flush({ description: "hello", sourceLang: "fr", cached: false });

      expect(first).toEqual({
        description: "hello",
        sourceLang: "fr",
        cached: false,
      });

      let second: any;
      service.translateBlueprint("bp1").subscribe((r) => (second = r));
      httpMock.expectNone("/api/blueprints/bp1/translate");
      expect(second).toEqual(first);
    });
  });

  describe("translateComments", () => {
    it("only requests the ids not already cached", () => {
      const service = makeService("en-US");

      let first: any;
      service
        .translateComments("bp1", ["c1", "c2"])
        .subscribe((r) => (first = r));
      const req = httpMock.expectOne("/api/blueprints/bp1/comments/translate");
      expect(req.request.body).toEqual({ lang: "en", ids: ["c1", "c2"] });
      req.flush({
        translations: [
          {
            id: "c1",
            segments: [{ type: "text", text: "one" }],
            sourceLang: "fr",
            cached: false,
          },
          {
            id: "c2",
            segments: [{ type: "text", text: "two" }],
            sourceLang: "fr",
            cached: false,
          },
        ],
      });
      expect(first.translations).toHaveLength(2);

      let second: any;
      service
        .translateComments("bp1", ["c1", "c3"])
        .subscribe((r) => (second = r));
      const req2 = httpMock.expectOne("/api/blueprints/bp1/comments/translate");
      expect(req2.request.body).toEqual({ lang: "en", ids: ["c3"] });
      req2.flush({
        translations: [
          {
            id: "c3",
            segments: [{ type: "text", text: "three" }],
            sourceLang: "fr",
            cached: false,
          },
        ],
      });
      expect(second.translations.map((t: any) => t.id)).toEqual(["c1", "c3"]);
    });

    it("issues no request when every id is already cached", () => {
      const service = makeService("en-US");
      service.translateComments("bp1", ["c1"]).subscribe();
      httpMock.expectOne("/api/blueprints/bp1/comments/translate").flush({
        translations: [
          {
            id: "c1",
            segments: [{ type: "text", text: "one" }],
            sourceLang: "fr",
            cached: false,
          },
        ],
      });

      service.translateComments("bp1", ["c1"]).subscribe();
      httpMock.expectNone("/api/blueprints/bp1/comments/translate");
    });
  });
});
