import { TranslateRequest } from '@google-cloud/translate/build/src/v2';
import {
  CAPS,
  GEMINI_ENDPOINT,
  GEMINI_MODEL,
  GEMINI_TIMEOUT_MS,
  GOOGLE_TIMEOUT_MS,
} from './constants';
import { assertGeminiRequestWithinCap, assertGoogleCharacters } from './caps';
import { GeminiRequestBody, LlmMode } from './prompts';
import {
  ArmOutput,
  DiacriticCase,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  TokenUsage,
} from './types';

interface GoogleMetadata {
  data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] };
  [key: string]: unknown;
}

export interface GoogleTransport {
  translate(texts: string[], options: TranslateRequest): Promise<[string[], GoogleMetadata]>;
}

export interface GoogleBatchResult {
  texts: string[];
  raw: GoogleMetadata;
  sourceCharacters: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Experiment request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export class GoogleExperimentClient {
  public constructor(private readonly transport: GoogleTransport) {}

  public async translate(
    texts: string[],
    source: 'auto' | 'vi',
    captureRaw?: (raw: GoogleMetadata) => void
  ): Promise<GoogleBatchResult> {
    const sourceCharacters = assertGoogleCharacters(texts, CAPS.sourceCharacters);
    const options: TranslateRequest = { to: 'en', format: 'text' };
    if (source === 'vi') options.from = 'vi';
    const [translated, raw] = await withTimeout(
      this.transport.translate(texts, options),
      GOOGLE_TIMEOUT_MS
    );
    captureRaw?.(raw);
    if (!Array.isArray(translated) || translated.length !== texts.length) {
      throw new Error(
        `Google returned ${translated?.length ?? 0} results for ${texts.length} inputs`
      );
    }
    return { texts: translated, raw, sourceCharacters };
  }
}

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  [key: string]: unknown;
}

export interface GeminiBatchResult {
  outputs: ArmOutput[];
  raw: GeminiResponse;
  usage: TokenUsage;
}

export class GeminiExperimentClient {
  public constructor(private readonly transport: HttpTransport) {}

  public async assertModelAvailable(): Promise<void> {
    const response = await this.transport.send({
      url: `${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}`,
      method: 'GET',
      headers: {},
      timeoutMs: GEMINI_TIMEOUT_MS,
    });
    assertSuccess(response, 'Gemini model metadata request');
    const name = (response.body as { name?: unknown })?.name;
    if (name !== `models/${GEMINI_MODEL}`) {
      throw new Error(`Required model ${GEMINI_MODEL} is unavailable to this key`);
    }
  }

  public async complete(
    requestBody: GeminiRequestBody,
    cases: DiacriticCase[],
    mode: LlmMode,
    captureRaw?: (raw: GeminiResponse) => void
  ): Promise<GeminiBatchResult> {
    assertFixedGeminiConfig(requestBody);
    const serialized = JSON.stringify(requestBody);
    assertGeminiRequestWithinCap(serialized);
    const response = await this.transport.send({
      url: `${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}:generateContent`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: serialized,
      timeoutMs: GEMINI_TIMEOUT_MS,
    });
    const raw = response.body as GeminiResponse;
    captureRaw?.(raw);
    assertSuccess(response, 'Gemini completion request');
    if (raw.promptFeedback?.blockReason != null) {
      throw new Error(`Gemini blocked the prompt: ${raw.promptFeedback.blockReason}`);
    }
    const candidate = raw.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') {
      throw new Error(
        `Gemini completion did not finish normally: ${candidate?.finishReason ?? 'none'}`
      );
    }
    const content = candidate.content?.parts
      ?.map(part => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('');
    if (content == null || content.length === 0) {
      throw new Error('Gemini response has no completion content');
    }
    const usage = validateGeminiUsage(raw.usageMetadata);
    const parsed = JSON.parse(content) as { results?: unknown };
    return { outputs: validateLlmOutputs(parsed.results, cases, mode), raw, usage };
  }
}

function assertFixedGeminiConfig(request: GeminiRequestBody): void {
  const config = request.generationConfig;
  if (
    config.temperature !== 0 ||
    config.candidateCount !== CAPS.geminiCandidates ||
    config.maxOutputTokens !== CAPS.geminiOutputTokensPerCall ||
    config.responseMimeType !== 'application/json' ||
    config.thinkingConfig.thinkingBudget !== CAPS.geminiThinkingBudget
  ) {
    throw new Error('Gemini request does not match the fixed experiment configuration');
  }
  const forbidden = ['tools', 'toolConfig', 'cachedContent'] as const;
  for (const key of forbidden) {
    if (key in (request as unknown as Record<string, unknown>)) {
      throw new Error(`Gemini request contains forbidden capability: ${key}`);
    }
  }
}

function validateGeminiUsage(value: GeminiResponse['usageMetadata']): TokenUsage {
  const promptTokens = value?.promptTokenCount;
  const completionTokens = value?.candidatesTokenCount;
  const thoughtTokens = value?.thoughtsTokenCount ?? 0;
  const totalTokens = value?.totalTokenCount;
  if (
    !Number.isInteger(promptTokens) ||
    !Number.isInteger(completionTokens) ||
    !Number.isInteger(thoughtTokens) ||
    !Number.isInteger(totalTokens)
  ) {
    throw new Error('Gemini response omitted token usage');
  }
  if (
    promptTokens! > CAPS.geminiInputTokensPerCall ||
    completionTokens! + thoughtTokens > CAPS.geminiOutputTokensPerCall
  ) {
    throw new Error('Gemini reported usage beyond a per-call cap');
  }
  return {
    promptTokens: promptTokens!,
    completionTokens: completionTokens!,
    thoughtTokens,
    totalTokens: totalTokens!,
  };
}

function assertSuccess(response: HttpResponse, operation: string): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${operation} failed with HTTP ${response.status}`);
  }
}

export function validateLlmOutputs(
  value: unknown,
  cases: DiacriticCase[],
  mode: LlmMode
): ArmOutput[] {
  if (!Array.isArray(value) || value.length !== cases.length) {
    throw new Error(`LLM result must contain exactly ${cases.length} rows`);
  }
  const expected = new Set(cases.map(item => item.id));
  const seen = new Set<string>();
  for (const raw of value) {
    const item = raw as Partial<ArmOutput>;
    if (
      typeof item.id !== 'string' ||
      !expected.has(item.id) ||
      seen.has(item.id) ||
      (item.status !== 'resolved' && item.status !== 'ambiguous') ||
      typeof item.restoredVi !== 'string' ||
      !Array.isArray(item.alternatives) ||
      item.alternatives.length > 3 ||
      item.alternatives.some(alt => typeof alt !== 'string') ||
      (mode === 'end-to-end' && typeof item.english !== 'string')
    ) {
      throw new Error('LLM result has an unknown, duplicate, missing, or malformed row');
    }
    seen.add(item.id);
  }
  if (seen.size !== expected.size) throw new Error('LLM result ID set does not match the fixture');
  return value as ArmOutput[];
}

export function createGeminiFetchTransport(apiKey: string): HttpTransport {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: { ...request.headers, 'x-goog-api-key': apiKey },
          body: request.body,
          signal: controller.signal,
        });
        const text = await response.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          // Preserve a non-JSON provider error for the redacted raw artifact.
        }
        return { status: response.status, body };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
