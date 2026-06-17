import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { LOCALE_ID } from "@angular/core";
import { registerLocaleData } from "@angular/common";
import localeRu from "@angular/common/locales/ru";
import localeKo from "@angular/common/locales/ko";

import { GameStringService } from "./game-string-service";

registerLocaleData(localeRu);
registerLocaleData(localeKo);

// Escape a value for inclusion inside a quoted gettext .po string.
// Unescaped quotes/backslashes corrupt the file and make po.parse throw.
function poEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Build a minimal gettext .po file body from msgctxt -> { msgid, msgstr } pairs.
function buildPo(
  entries: Array<{ ctxt: string; id: string; str: string }>
): string {
  const header = [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    "",
  ].join("\n");
  const body = entries
    .map(
      (e) =>
        `msgctxt "${poEscape(e.ctxt)}"\nmsgid "${poEscape(
          e.id
        )}"\nmsgstr "${poEscape(e.str)}"`
    )
    .join("\n\n");
  return header + "\n" + body + "\n";
}

describe("GameStringService", () => {
  let httpMock: HttpTestingController;

  function setup(locale: string) {
    TestBed.configureTestingModule({
      providers: [
        GameStringService,
        { provide: LOCALE_ID, useValue: locale },
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

  describe("po file selection", () => {
    it("requests the russian po file for the ru locale", () => {
      setup("ru");
      const req = httpMock.expectOne(
        "assets/strings/strings_preinstalled_ru_klei.po"
      );
      expect(req.request.method).toBe("GET");
      expect(req.request.responseType).toBe("text");
      req.flush(buildPo([{ ctxt: "A", id: "Hi", str: "Privet" }]));
    });

    it("requests the korean po file for the ko locale", () => {
      setup("ko");
      const req = httpMock.expectOne(
        "assets/strings/strings_preinstalled_ko_klei.po"
      );
      req.flush(buildPo([{ ctxt: "A", id: "Hi", str: "annyeong" }]));
    });

    it("falls back to the zh po file for the en locale (to read msgid)", () => {
      setup("en");
      const req = httpMock.expectOne(
        "assets/strings/strings_preinstalled_zh_klei.po"
      );
      req.flush(buildPo([{ ctxt: "A", id: "Original", str: "ZhTranslated" }]));
    });
  });

  describe("getStr", () => {
    it("returns the translated msgstr for a non-en locale", async () => {
      const service = setup("ru");
      httpMock
        .expectOne("assets/strings/strings_preinstalled_ru_klei.po")
        .flush(buildPo([{ ctxt: "GREETING", id: "Hi", str: "Privet" }]));

      expect(await service.getStr("GREETING")).toBe("Privet");
    });

    it("returns the original msgid for the en locale", async () => {
      const service = setup("en");
      httpMock
        .expectOne("assets/strings/strings_preinstalled_zh_klei.po")
        .flush(buildPo([{ ctxt: "GREETING", id: "Hi", str: "NiHao" }]));

      expect(await service.getStr("GREETING")).toBe("Hi");
    });

    it("returns undefined for an unknown msgctxt", async () => {
      const service = setup("ru");
      httpMock
        .expectOne("assets/strings/strings_preinstalled_ru_klei.po")
        .flush(buildPo([{ ctxt: "KNOWN", id: "Hi", str: "Privet" }]));

      expect(await service.getStr("MISSING")).toBeUndefined();
    });

    it("populates the public dict after the po file loads", async () => {
      const service = setup("ru");
      httpMock
        .expectOne("assets/strings/strings_preinstalled_ru_klei.po")
        .flush(buildPo([{ ctxt: "KEY", id: "Hi", str: "Privet" }]));

      await service.getStr("KEY");
      expect(service.dict["KEY"]).toBe("Privet");
    });
  });

  describe("markup stripping", () => {
    async function strip(rawValue: string): Promise<string> {
      const service = setup("ru");
      httpMock
        .expectOne("assets/strings/strings_preinstalled_ru_klei.po")
        .flush(buildPo([{ ctxt: "K", id: "id", str: rawValue }]));
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

    it("keeps an empty translation falsy without applying replacements", async () => {
      const service = setup("ru");
      httpMock
        .expectOne("assets/strings/strings_preinstalled_ru_klei.po")
        .flush(buildPo([{ ctxt: "EMPTY", id: "id", str: "" }]));
      const result = await service.getStr("EMPTY");
      expect(result).toBeFalsy();
    });
  });
});
