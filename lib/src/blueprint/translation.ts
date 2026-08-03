// User-content translation (spec/user-content-translation-impl.md). Shared
// shapes for the translate endpoints — the four UI locales are a hard
// allowlist, not a shape check: an unknown target language is money spent on
// a page nobody can read.

import { CommentSegment } from '../coms/comments';

export const TRANSLATION_TARGET_LANGS = ['en', 'zh-Hans', 'ru', 'ko'] as const;
export type TranslationTargetLang = (typeof TRANSLATION_TARGET_LANGS)[number];

export function isTranslationTargetLang(value: unknown): value is TranslationTargetLang {
  return typeof value === 'string' && (TRANSLATION_TARGET_LANGS as readonly string[]).includes(value);
}

// One comment thread visible at once is one request; caps the batch endpoint.
export const MAX_TRANSLATE_BATCH = 50;

export interface TranslateBlueprintRequest {
  lang: TranslationTargetLang;
}

export interface TranslateBlueprintResponse {
  description: string;
  sourceLang: string | null;
  cached: boolean;
  degraded?: boolean;
}

export interface TranslateCommentsRequest {
  lang: TranslationTargetLang;
  ids: string[];
}

export interface TranslatedCommentDto {
  id: string;
  // Pre-resolved like CommentDto.segments (reference tokens restored, then
  // rendered through the same name-resolution pipeline) — never a raw body
  // string, so a translated {{user:id}} token never leaks to the client.
  segments: CommentSegment[];
  sourceLang: string | null;
  cached: boolean;
  degraded?: boolean;
}

export interface TranslateCommentsResponse {
  translations: TranslatedCommentDto[];
}

export const TRANSLATION_BUDGET_EXCEEDED_CODE = 'TRANSLATION_BUDGET_EXCEEDED';
