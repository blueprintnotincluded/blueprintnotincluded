/** Max title length, in UTF-16 code units — the unit Mongoose's maxlength counts. */
export declare const MAX_BLUEPRINT_NAME_LENGTH = 60;
export type BlueprintNameRejection = 'empty' | 'too-long' | 'control' | 'invisible' | 'stacked-marks' | 'mixed-script';
export type BlueprintNameResult = {
    ok: true;
    name: string;
} | {
    ok: false;
    reason: BlueprintNameRejection;
    message: string;
};
/**
 * Canonical stored form: NFC, every kind of whitespace collapsed to single
 * spaces, trimmed. Idempotent — normalizing a normalized name is a no-op,
 * which is what lets the schema validator insist on the canonical form.
 *
 * NFC (not NFD) so that a title typed on macOS, which hands over decomposed
 * text, is byte-equal to the same title typed on Windows. The {owner, name}
 * duplicate check is an exact string match, so without this a user could not
 * overwrite their own blueprint from a different machine.
 */
export declare function normalizeBlueprintName(raw: string): string;
/**
 * Validate an already-normalized name. Callers that accept user input should
 * go through `validateBlueprintName`, which normalizes first; this is the form
 * the schema enforces, so that stored titles are always canonical.
 */
export declare function checkNormalizedBlueprintName(name: string): BlueprintNameResult;
/** Normalize, then validate. The name in a successful result is what to store. */
export declare function validateBlueprintName(raw: unknown): BlueprintNameResult;
/** True only for the exact canonical form of a legal name — the schema's test. */
export declare function isCanonicalBlueprintName(value: unknown): boolean;
//# sourceMappingURL=blueprint-name.d.ts.map