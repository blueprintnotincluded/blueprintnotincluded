export const GEMINI_VI_TITLE_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_VI_TITLE_PROMPT_VERSION = 'vi-romanized-title-gemini-3.1-flash-lite-v1';
export const GEMINI_VI_TITLE_MODE = 'vi-romanized-title-v1' as const;
export const GEMINI_VI_TITLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_VI_TITLE_TIMEOUT_MS = 15_000;
export const GEMINI_VI_TITLE_BATCH_SIZE = 12;
export const GEMINI_VI_TITLE_BATCH_CHARACTERS = 720;
export const GEMINI_VI_TITLE_DEFAULT_MAX_INPUT_TOKENS = 4096;
// Output usage counts completion + thought tokens (validateUsage). Measured on
// the 2026-08-26 prod-restore rehearsal: a full 12-title batch spends 716-740
// output tokens even at thinkingLevel minimal, so the previous 768 cap
// truncated 113 of 199 batches with MAX_TOKENS. 2048 leaves ~3x headroom; the
// env override (boundedPositiveInt) can only lower this, never raise it.
export const GEMINI_VI_TITLE_DEFAULT_MAX_OUTPUT_TOKENS = 2048;

export type VietnameseTitleStatus = 'translated' | 'ambiguous' | 'not-vietnamese';

export interface VietnameseTitleInput {
  id: string;
  text: string;
}

export interface VietnameseTitleResult {
  id: string;
  status: VietnameseTitleStatus;
  restoredVi: string;
  english: string;
  alternatives: string[];
}

export interface GeminiVietnameseTitleRequest {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: 'user'; parts: { text: string }[] }[];
  generationConfig: {
    temperature: 0;
    candidateCount: 1;
    maxOutputTokens: number;
    responseMimeType: 'application/json';
    responseJsonSchema: Record<string, unknown>;
    thinkingConfig: { thinkingLevel: 'minimal' };
  };
}

const SYSTEM_PROMPT = `Inputs are user-authored Oxygen Not Included blueprint titles that may be Vietnamese typed without diacritics. For each input, decide whether it is romanized Vietnamese. If it is, restore the intended Vietnamese and translate its meaning to English. Use ONI context only to disambiguate; never invent absent details. Preserve digits, version markers, punctuation, and ASCII game jargon such as SPOM. Use status "not-vietnamese" for English, acronyms, and other languages. If Vietnamese meaning is genuinely underdetermined, use status "ambiguous" and at most three plausible alternatives instead of guessing. Return exactly one result per input and only data matching the schema.`;

export function vietnameseTitleResponseSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      results: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            status: {
              type: 'string',
              enum: ['translated', 'ambiguous', 'not-vietnamese'],
            },
            restoredVi: { type: 'string' },
            english: { type: 'string' },
            alternatives: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 3,
            },
          },
          required: ['id', 'status', 'restoredVi', 'english', 'alternatives'],
        },
      },
    },
    required: ['results'],
  };
}

export function buildVietnameseTitleRequest(
  inputs: VietnameseTitleInput[],
  maxOutputTokens: number
): GeminiVietnameseTitleRequest {
  return {
    systemInstruction: {
      parts: [{ text: `${GEMINI_VI_TITLE_PROMPT_VERSION}\n${SYSTEM_PROMPT}` }],
    },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ inputs }) }] }],
    generationConfig: {
      temperature: 0,
      candidateCount: 1,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseJsonSchema: vietnameseTitleResponseSchema(inputs.length),
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  };
}

function boundedPositiveInt(value: string | undefined, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : maximum;
}

export function geminiVietnameseTitleCaps(): {
  inputTokens: number;
  outputTokens: number;
} {
  return {
    inputTokens: boundedPositiveInt(
      process.env.GEMINI_VI_TITLE_MAX_INPUT_TOKENS,
      GEMINI_VI_TITLE_DEFAULT_MAX_INPUT_TOKENS
    ),
    outputTokens: boundedPositiveInt(
      process.env.GEMINI_VI_TITLE_MAX_OUTPUT_TOKENS,
      GEMINI_VI_TITLE_DEFAULT_MAX_OUTPUT_TOKENS
    ),
  };
}

export function conservativeGeminiInputTokens(serialized: string): number {
  return Buffer.byteLength(serialized, 'utf8') + 64;
}

export function geminiMaximumMicroUsd(inputTokens: number, outputTokens: number): number {
  // Verified 2026-08-05: $0.25/M input and $1.50/M output. In micro-USD,
  // those rates are 0.25 and 1.5 per token respectively.
  return Math.ceil(inputTokens * 0.25 + outputTokens * 1.5);
}

export function geminiObservedMicroUsd(inputTokens: number, outputTokens: number): number {
  return geminiMaximumMicroUsd(inputTokens, outputTokens);
}
