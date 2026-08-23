export const EXPERIMENT_REVISION = 'vi-diacritic-ab-gemini-3-1-v3';
export const ARTIFACT_DIR = 'tmp/llm-diacritic-ab-gemini-3-1';
export const V1_ARTIFACT_DIR = 'tmp/llm-diacritic-ab';
export const V2_ARTIFACT_DIR = 'tmp/llm-diacritic-ab-gemini';
export const FIXTURE_PATH = 'app/api/experiments/fixtures/vi-diacritic-cases.json';

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_CREDENTIAL_NAME = 'GEMINI_API_KEY';
export const GEMINI_ACCESS_CHECK_TEXT = 'Reply with K.';
export const GEMINI_TIMEOUT_MS = 30_000;
export const GOOGLE_TIMEOUT_MS = 15_000;

export const CAPS = Object.freeze({
  fixtureCases: 12,
  sourceCharacters: 256,
  geminiCalls: 2,
  googleCalls: 3,
  geminiInputTokensPerCall: 4096,
  geminiOutputTokensPerCall: 768,
  geminiInputTokens: 8192,
  geminiOutputTokens: 1536,
  geminiAccessCheckInputTokens: 16,
  geminiAccessCheckOutputTokens: 1,
  googleSourceCharacters: 768,
  geminiCandidates: 1,
  geminiThinkingLevel: 'minimal' as const,
  retries: 0,
  concurrency: 1,
  acknowledgedUsd: 0.02,
});

export const RATES = Object.freeze({
  verifiedOn: '2026-08-05',
  geminiInputUsdPerMillionTokens: 0.25,
  geminiOutputUsdPerMillionTokens: 1.5,
  googleUsdPerMillionCharacters: 20,
});

export const MAX_APPROVED_RATES = Object.freeze({
  geminiInputUsdPerMillionTokens: 0.25,
  geminiOutputUsdPerMillionTokens: 1.5,
  googleUsdPerMillionCharacters: 20,
});

export const PROMPT_VERSIONS = Object.freeze({
  endToEnd: 'vi-diacritic-end-to-end-gemini-3-1-v3',
  restore: 'vi-diacritic-restore-gemini-3-1-v3',
});
