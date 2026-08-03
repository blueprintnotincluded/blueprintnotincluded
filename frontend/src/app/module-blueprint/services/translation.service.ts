import { Inject, Injectable, LOCALE_ID } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, of } from "rxjs";
import { map, tap } from "rxjs/operators";
import {
  CommentSegment,
  TranslateBlueprintResponse,
  TranslateCommentsResponse,
  TranslationTargetLang,
} from "../../../../../lib/index";
import { AuthenticationService } from "./authentification-service";

// One of the four locales the site actually builds (frontend/angular.json);
// LOCALE_ID arrives as a full Angular locale code (en-US, zh-Hans, ru, ko).
const TARGET_LANG_BY_LOCALE: Record<string, TranslationTargetLang> = {
  "en-US": "en",
  "zh-Hans": "zh-Hans",
  ru: "ru",
  ko: "ko",
};

@Injectable()
export class TranslationService {
  // In-memory per-session caches — one map per content kind, each keyed by
  // the bare document id — so toggling original/translated is instant and
  // free after the first fetch. Cleared on page reload, which is fine: the
  // durable cache is server-side.
  private blueprintCache = new Map<string, TranslateBlueprintResponse>();
  private commentCache = new Map<
    string,
    {
      segments: CommentSegment[];
      sourceLang: string | null;
      cached: boolean;
      degraded?: boolean;
    }
  >();

  constructor(
    private http: HttpClient,
    private auth: AuthenticationService,
    @Inject(LOCALE_ID) private locale: string,
  ) {}

  get viewerLang(): TranslationTargetLang {
    return TARGET_LANG_BY_LOCALE[this.locale] ?? "en";
  }

  // Whether `sourceLang` (an ISO-639-1 code, e.g. from Blueprint.sourceLang /
  // CommentDto.sourceLang) is already the viewer's language — the "Translate"
  // button must not appear for content already in the viewer's own tongue.
  matchesViewerLang(sourceLang: string): boolean {
    const base = this.viewerLang === "zh-Hans" ? "zh" : this.viewerLang;
    return sourceLang === base;
  }

  translateBlueprint(id: string): Observable<TranslateBlueprintResponse> {
    const cached = this.blueprintCache.get(id);
    if (cached) return of(cached);
    return this.http
      .post<TranslateBlueprintResponse>(
        `/api/blueprints/${id}/translate`,
        { lang: this.viewerLang },
        { headers: this.authHeaders() },
      )
      .pipe(tap((response) => this.blueprintCache.set(id, response)));
  }

  translateComments(
    blueprintId: string,
    ids: string[],
  ): Observable<TranslateCommentsResponse> {
    const uncached = ids.filter((id) => !this.commentCache.has(id));
    const fetch$: Observable<TranslateCommentsResponse> =
      uncached.length === 0
        ? of({ translations: [] })
        : this.http.post<TranslateCommentsResponse>(
            `/api/blueprints/${blueprintId}/comments/translate`,
            { lang: this.viewerLang, ids: uncached },
            { headers: this.authHeaders() },
          );

    return fetch$.pipe(
      tap((response) => {
        for (const t of response.translations) {
          this.commentCache.set(t.id, {
            segments: t.segments,
            sourceLang: t.sourceLang,
            cached: t.cached,
            degraded: t.degraded,
          });
        }
      }),
      map(() => ({
        translations: ids
          .map((id) => {
            const entry = this.commentCache.get(id);
            return entry
              ? {
                  id,
                  segments: entry.segments,
                  sourceLang: entry.sourceLang,
                  cached: entry.cached,
                  degraded: entry.degraded,
                }
              : null;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null),
      })),
    );
  }

  cachedComment(id: string) {
    return this.commentCache.get(id) ?? null;
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.auth.getToken()}` };
  }
}
