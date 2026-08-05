import { TranslateRequest } from '@google-cloud/translate/build/src/v2';
import { CAPS, DO_ENDPOINT, DO_MODEL, DO_TIMEOUT_MS, GOOGLE_TIMEOUT_MS } from './constants';
import { assertDoRequestWithinCap, assertGoogleCharacters } from './caps';
import { DoRequestBody, LlmMode } from './prompts';
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

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  [key: string]: unknown;
}

export interface DoBatchResult {
  outputs: ArmOutput[];
  raw: ChatCompletionResponse;
  usage: TokenUsage;
}

export class DigitalOceanExperimentClient {
  public constructor(private readonly transport: HttpTransport) {}

  public async assertModelAvailable(): Promise<void> {
    const response = await this.transport.send({
      url: `${DO_ENDPOINT}/v1/models`,
      method: 'GET',
      headers: {},
      timeoutMs: DO_TIMEOUT_MS,
    });
    assertSuccess(response, 'DO model-list request');
    const data = (response.body as { data?: { id?: string }[] })?.data;
    if (!Array.isArray(data) || !data.some(model => model.id === DO_MODEL)) {
      throw new Error(`Required model ${DO_MODEL} is unavailable to this key`);
    }
  }

  public async complete(
    requestBody: DoRequestBody,
    cases: DiacriticCase[],
    mode: LlmMode,
    captureRaw?: (raw: ChatCompletionResponse) => void
  ): Promise<DoBatchResult> {
    if (requestBody.model !== DO_MODEL) throw new Error(`Unexpected model: ${requestBody.model}`);
    const serialized = JSON.stringify(requestBody);
    assertDoRequestWithinCap(serialized);
    const response = await this.transport.send({
      url: `${DO_ENDPOINT}/v1/chat/completions`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: serialized,
      timeoutMs: DO_TIMEOUT_MS,
    });
    const raw = response.body as ChatCompletionResponse;
    captureRaw?.(raw);
    assertSuccess(response, 'DO completion request');
    const content = raw.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('DO response has no completion content');
    const promptTokens = raw.usage?.prompt_tokens;
    const completionTokens = raw.usage?.completion_tokens;
    if (!Number.isInteger(promptTokens) || !Number.isInteger(completionTokens)) {
      throw new Error('DO response omitted token usage');
    }
    if (
      promptTokens! > CAPS.doInputTokensPerCall ||
      completionTokens! > CAPS.doOutputTokensPerCall
    ) {
      throw new Error('DO reported usage beyond a per-call cap');
    }
    const parsed = JSON.parse(content) as { results?: unknown };
    return {
      outputs: validateLlmOutputs(parsed.results, cases, mode),
      raw,
      usage: { promptTokens: promptTokens!, completionTokens: completionTokens! },
    };
  }
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

export function createFetchTransport(apiKey: string): HttpTransport {
  return {
    async send(request: HttpRequest): Promise<HttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: { ...request.headers, authorization: `Bearer ${apiKey}` },
          body: request.body,
          signal: controller.signal,
        });
        return { status: response.status, body: (await response.json()) as unknown };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
