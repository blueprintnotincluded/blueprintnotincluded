import { CommentSegment } from '../coms/comments';
export declare const TRANSLATION_TARGET_LANGS: readonly ["en", "zh-Hans", "ru", "ko"];
export type TranslationTargetLang = (typeof TRANSLATION_TARGET_LANGS)[number];
export declare function isTranslationTargetLang(value: unknown): value is TranslationTargetLang;
export declare const MAX_TRANSLATE_BATCH = 50;
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
    segments: CommentSegment[];
    sourceLang: string | null;
    cached: boolean;
    degraded?: boolean;
}
export interface TranslateCommentsResponse {
    translations: TranslatedCommentDto[];
}
export declare const TRANSLATION_BUDGET_EXCEEDED_CODE = "TRANSLATION_BUDGET_EXCEEDED";
//# sourceMappingURL=translation.d.ts.map