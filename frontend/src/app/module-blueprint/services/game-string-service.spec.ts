import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

import { GameStringService } from "./game-string-service";

const STRINGS_FILE = "assets/strings/strings.json";

describe("GameStringService", () => {
  let httpMock: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        GameStringService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    const service = TestBed.inject(GameStringService);
    httpMock = TestBed.inject(HttpTestingController);
    return service;
  }

  afterEach(() => {
    httpMock?.verify();
  });

  it("requests the english strings json", () => {
    setup();
    const req = httpMock.expectOne(STRINGS_FILE);
    expect(req.request.method).toBe("GET");
    req.flush({ A: "Hi" });
  });

  describe("getStr", () => {
    it("returns the value for a known key", async () => {
      const service = setup();
      httpMock.expectOne(STRINGS_FILE).flush({ GREETING: "Hi" });
      expect(await service.getStr("GREETING")).toBe("Hi");
    });

    it("returns undefined for an unknown key", async () => {
      const service = setup();
      httpMock.expectOne(STRINGS_FILE).flush({ KNOWN: "Hi" });
      expect(await service.getStr("MISSING")).toBeUndefined();
    });

    it("populates the public dict after the file loads", async () => {
      const service = setup();
      httpMock.expectOne(STRINGS_FILE).flush({ KEY: "Hi" });
      await service.getStr("KEY");
      expect(service.dict["KEY"]).toBe("Hi");
    });
  });

  describe("markup stripping", () => {
    async function strip(rawValue: string): Promise<string> {
      const service = setup();
      httpMock.expectOne(STRINGS_FILE).flush({ K: rawValue });
      return service.getStr("K");
    }

    it("strips <color> tags", async () => {
      expect(await strip("<color=#FF0000>Red</color>")).toBe("Red");
    });

    it("strips <size> tags", async () => {
      expect(await strip("<size=20>Big</size>")).toBe("Big");
    });

    it("strips <style> tags", async () => {
      expect(await strip("<style=KExpBld>Styled</style>")).toBe("Styled");
    });

    it("strips <smallcaps> tags", async () => {
      expect(await strip("<smallcaps>caps</smallcaps>")).toBe("caps");
    });

    it("strips <link> tags", async () => {
      expect(await strip('<link="x">Linked</link>')).toBe("Linked");
    });

    it("leaves plain text untouched", async () => {
      expect(await strip("Plain text")).toBe("Plain text");
    });

    it("keeps an empty value falsy without applying replacements", async () => {
      const service = setup();
      httpMock.expectOne(STRINGS_FILE).flush({ EMPTY: "" });
      expect(await service.getStr("EMPTY")).toBeFalsy();
    });
  });
});
