import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

// English game strings, generated from the export's po_string.json by
// `npm run import:2024` (app/api/batch/convert-export-2024.ts). The map is keyed by the
// Klei string id under a "STRINGS." prefix (e.g. "STRINGS.ELEMENTS.MOLTENZINC.NAME") and
// values still carry Klei rich-text markup, which is stripped on load. The site is
// English-only; the legacy per-locale .po files have been retired.
const STRINGS_FILE = "assets/strings/strings.json";

// Klei rich-text tags to strip for display. Each removes the wrapper and keeps the inner
// text. Applied once per value at load time.
const MARKUP_PATTERNS: RegExp[] = [
  /<color=#.+?>(.*?)<\/color>/i,
  /<size=.+?>(.*?)<\/size>/i,
  /<style=.+?>(.*?)<\/style>/i,
  /<smallcaps>(.*?)<\/smallcaps>/i,
  /<link=".+?">(.*?)<\/link>/i,
  /<alpha=#.+?>((.|\n)*?)<\/color>/i,
  /<indent=#.+?>((.|\n)*?)<\/indent>/i,
];

function stripMarkup(value: string): string {
  if (!value) return value;
  let result = value;
  for (const pattern of MARKUP_PATTERNS) result = result.replace(pattern, "$1");
  return result;
}

@Injectable({ providedIn: "root" })
export class GameStringService {
  private stringData: Promise<Record<string, string>>;
  public dict!: Record<string, string>;

  constructor(private http: HttpClient) {
    this.stringData = new Promise((resolve) => {
      this.http.get<Record<string, string>>(STRINGS_FILE).subscribe((data) => {
        const dict: Record<string, string> = {};
        for (const [key, value] of Object.entries(data))
          dict[key] = stripMarkup(value);
        this.dict = dict;
        resolve(dict);
      });
    });
  }

  async getStr(msgctxt: string) {
    return (await this.stringData)[msgctxt];
  }
}
