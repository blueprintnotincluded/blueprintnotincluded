export const ARTIFACT_DIR = 'tmp/llm-diacritic-ab';
export const FIXTURE_PATH = 'app/api/experiments/fixtures/vi-diacritic-cases.json';

export const DO_ENDPOINT = 'https://inference.do-ai.run';
export const DO_MODEL = 'openai-gpt-4o-mini';
export const DO_TIMEOUT_MS = 30_000;
export const GOOGLE_TIMEOUT_MS = 15_000;

export const CAPS = Object.freeze({
  fixtureCases: 12,
  sourceCharacters: 256,
  doCalls: 2,
  googleCalls: 3,
  doInputTokensPerCall: 4096,
  doOutputTokensPerCall: 768,
  doInputTokens: 8192,
  doOutputTokens: 1536,
  googleSourceCharacters: 768,
  retries: 0,
  concurrency: 1,
  acknowledgedUsd: 0.02,
});

export const RATES = Object.freeze({
  verifiedOn: '2026-08-04',
  doInputUsdPerMillionTokens: 0.15,
  doOutputUsdPerMillionTokens: 0.6,
  googleUsdPerMillionCharacters: 20,
});

export const MAX_APPROVED_RATES = Object.freeze({
  doInputUsdPerMillionTokens: 0.15,
  doOutputUsdPerMillionTokens: 0.6,
  googleUsdPerMillionCharacters: 20,
});

export const PROMPT_VERSIONS = Object.freeze({
  endToEnd: 'vi-diacritic-end-to-end-v1',
  restore: 'vi-diacritic-restore-v1',
});
