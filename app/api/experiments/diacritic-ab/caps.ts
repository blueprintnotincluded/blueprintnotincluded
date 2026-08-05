import { CAPS, MAX_APPROVED_RATES, RATES } from './constants';

export interface Reservation {
  geminiCalls: number;
  googleCalls: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
  googleSourceCharacters: number;
  maximumUsd: number;
}

export function calculateMaximumCost(): number {
  return (
    (CAPS.geminiInputTokens * RATES.geminiInputUsdPerMillionTokens) / 1_000_000 +
    (CAPS.geminiOutputTokens * RATES.geminiOutputUsdPerMillionTokens) / 1_000_000 +
    (CAPS.googleSourceCharacters * RATES.googleUsdPerMillionCharacters) / 1_000_000
  );
}

export function assertApprovedRates(): void {
  for (const key of Object.keys(MAX_APPROVED_RATES) as (keyof typeof MAX_APPROVED_RATES)[]) {
    if (RATES[key] > MAX_APPROVED_RATES[key]) {
      throw new Error(
        `Recorded ${key} exceeds its approved rate; review the plan before executing`
      );
    }
  }
}

export function fullReservation(): Reservation {
  assertApprovedRates();
  const maximumUsd = calculateMaximumCost();
  if (maximumUsd > CAPS.acknowledgedUsd) {
    throw new Error(`Maximum $${maximumUsd.toFixed(7)} exceeds acknowledged ceiling`);
  }
  return {
    geminiCalls: CAPS.geminiCalls,
    googleCalls: CAPS.googleCalls,
    geminiInputTokens: CAPS.geminiInputTokens,
    geminiOutputTokens: CAPS.geminiOutputTokens,
    googleSourceCharacters: CAPS.googleSourceCharacters,
    maximumUsd,
  };
}

export function assertGeminiRequestWithinCap(serializedBody: string): number {
  // Every UTF-8 byte is treated as a token, plus 64 tokens for protocol/message
  // framing. This substantially over-counts this ASCII-heavy prompt and needs no
  // model tokenizer dependency.
  const conservativeTokens = Buffer.byteLength(serializedBody, 'utf8') + 64;
  if (conservativeTokens > CAPS.geminiInputTokensPerCall) {
    throw new Error(
      `Gemini request reserves ${conservativeTokens} input tokens; per-call cap is ${CAPS.geminiInputTokensPerCall}`
    );
  }
  return conservativeTokens;
}

export function assertGoogleCharacters(texts: string[], maximum: number): number {
  const characters = texts.reduce((sum, text) => sum + text.length, 0);
  if (characters > maximum) {
    throw new Error(`Google request has ${characters} source characters; cap is ${maximum}`);
  }
  return characters;
}
