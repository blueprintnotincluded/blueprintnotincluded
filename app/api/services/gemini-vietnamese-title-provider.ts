import {
  buildVietnameseTitleRequest,
  conservativeGeminiInputTokens,
  GEMINI_VI_TITLE_ENDPOINT,
  GEMINI_VI_TITLE_MODEL,
  GEMINI_VI_TITLE_TIMEOUT_MS,
  geminiVietnameseTitleCaps,
  VietnameseTitleInput,
  VietnameseTitleResult,
} from './vietnamese-title-prompts';

export interface GeminiVietnameseTitleUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

export interface GeminiVietnameseTitleBatchResult {
  results: VietnameseTitleResult[];
  usage: GeminiVietnameseTitleUsage;
  latencyMs: number;
}

export interface GeminiVietnameseTitleTransport {
  send(request: {
    url: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs: number;
  }): Promise<{ status: number; body: unknown }>;
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface VietnameseTitleProvider {
  translate(inputs: VietnameseTitleInput[]): Promise<GeminiVietnameseTitleBatchResult>;
}

function sanitizeProviderError(error: unknown, key?: string, sensitiveTexts: string[] = []): Error {
  let message = error instanceof Error ? error.message : String(error);
  if (key) message = message.split(key).join('[REDACTED]');
  for (const text of sensitiveTexts) message = message.split(text).join('[REDACTED]');
  return new Error(message.slice(0, 300));
}

export function createGeminiVietnameseTitleTransport(
  apiKey: string
): GeminiVietnameseTitleTransport {
  return {
    async send(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: 'POST',
          headers: { ...request.headers, 'x-goog-api-key': apiKey },
          body: request.body,
          signal: controller.signal,
        });
        const raw = await response.text();
        let body: unknown = raw;
        try {
          body = JSON.parse(raw) as unknown;
        } catch {
          // The caller turns the bounded provider message into a sanitized error.
        }
        return { status: response.status, body };
      } catch (error) {
        throw sanitizeProviderError(error, apiKey);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export class GeminiVietnameseTitleProvider implements VietnameseTitleProvider {
  public constructor(
    private readonly transport?: GeminiVietnameseTitleTransport,
    private readonly apiKey: string | undefined = process.env.GEMINI_API_KEY
  ) {}

  public async translate(
    inputs: VietnameseTitleInput[]
  ): Promise<GeminiVietnameseTitleBatchResult> {
    const caps = geminiVietnameseTitleCaps();
    const request = buildVietnameseTitleRequest(inputs, caps.outputTokens);
    const serialized = JSON.stringify(request);
    const reservedInput = conservativeGeminiInputTokens(serialized);
    if (reservedInput > caps.inputTokens) {
      throw new Error(
        `Gemini Vietnamese-title request reserves ${reservedInput} input tokens; cap is ${caps.inputTokens}`
      );
    }
    if (!this.transport && !this.apiKey) {
      throw new Error('Gemini Vietnamese-title translation is not configured');
    }

    const startedAt = Date.now();
    let response: { status: number; body: unknown };
    try {
      response = await (this.transport ?? createGeminiVietnameseTitleTransport(this.apiKey!)).send({
        url: `${GEMINI_VI_TITLE_ENDPOINT}/models/${GEMINI_VI_TITLE_MODEL}:generateContent`,
        headers: { 'content-type': 'application/json' },
        body: serialized,
        timeoutMs: GEMINI_VI_TITLE_TIMEOUT_MS,
      });
    } catch (error) {
      throw sanitizeProviderError(
        error,
        this.apiKey,
        inputs.map(input => input.text)
      );
    }
    const latencyMs = Date.now() - startedAt;
    const raw = response.body as GeminiResponse;
    if (response.status < 200 || response.status >= 300) {
      const detail = (response.body as { error?: { message?: unknown } })?.error?.message;
      throw sanitizeProviderError(
        `Gemini Vietnamese-title request failed with HTTP ${response.status}${
          typeof detail === 'string' ? `: ${detail}` : ''
        }`,
        this.apiKey,
        inputs.map(input => input.text)
      );
    }
    if (raw.promptFeedback?.blockReason) {
      throw new Error(
        `Gemini Vietnamese-title request was blocked: ${raw.promptFeedback.blockReason}`
      );
    }
    if (raw.candidates?.length !== 1 || raw.candidates[0].finishReason !== 'STOP') {
      throw new Error(
        `Gemini Vietnamese-title request did not finish normally: ${
          raw.candidates?.[0]?.finishReason ?? 'none'
        }`
      );
    }
    const completion = raw.candidates[0].content?.parts
      ?.map(part => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('');
    if (!completion) throw new Error('Gemini Vietnamese-title response has no content');

    const usage = this.validateUsage(raw.usageMetadata, caps.inputTokens, caps.outputTokens);
    let parsed: { results?: unknown };
    try {
      parsed = JSON.parse(completion) as { results?: unknown };
    } catch {
      throw new Error('Gemini Vietnamese-title response was not valid JSON');
    }
    const results = this.validateResults(parsed.results, inputs);
    console.log(
      `[vi-title] model=${GEMINI_VI_TITLE_MODEL} inputs=${inputs.length} latencyMs=${latencyMs} ` +
        `inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens}`
    );
    return { results, usage, latencyMs };
  }

  private validateUsage(
    raw: GeminiResponse['usageMetadata'],
    inputCap: number,
    outputCap: number
  ): GeminiVietnameseTitleUsage {
    const inputTokens = raw?.promptTokenCount;
    const completionTokens = raw?.candidatesTokenCount;
    const thoughtTokens = raw?.thoughtsTokenCount ?? 0;
    const totalTokens = raw?.totalTokenCount;
    if (
      !Number.isInteger(inputTokens) ||
      !Number.isInteger(completionTokens) ||
      !Number.isInteger(thoughtTokens) ||
      !Number.isInteger(totalTokens) ||
      inputTokens! < 0 ||
      completionTokens! < 0 ||
      thoughtTokens < 0 ||
      totalTokens! < inputTokens! + completionTokens! + thoughtTokens
    ) {
      throw new Error('Gemini Vietnamese-title response omitted complete token usage');
    }
    const outputTokens = completionTokens! + thoughtTokens;
    if (inputTokens! > inputCap || outputTokens > outputCap) {
      throw new Error('Gemini Vietnamese-title response reported usage beyond a per-call cap');
    }
    return { inputTokens: inputTokens!, outputTokens, thoughtTokens, totalTokens: totalTokens! };
  }

  private validateResults(value: unknown, inputs: VietnameseTitleInput[]): VietnameseTitleResult[] {
    if (!Array.isArray(value) || value.length !== inputs.length) {
      throw new Error(
        `Gemini Vietnamese-title response must contain exactly ${inputs.length} results`
      );
    }
    const expected = new Set(inputs.map(input => input.id));
    const seen = new Set<string>();
    for (const raw of value) {
      const item = raw as Partial<VietnameseTitleResult>;
      if (
        typeof item.id !== 'string' ||
        !expected.has(item.id) ||
        seen.has(item.id) ||
        (item.status !== 'translated' &&
          item.status !== 'ambiguous' &&
          item.status !== 'not-vietnamese') ||
        typeof item.restoredVi !== 'string' ||
        typeof item.english !== 'string' ||
        !Array.isArray(item.alternatives) ||
        item.alternatives.length > 3 ||
        item.alternatives.some(value => typeof value !== 'string')
      ) {
        throw new Error(
          'Gemini Vietnamese-title response has an unknown, duplicate, or malformed result'
        );
      }
      seen.add(item.id);
    }
    if (seen.size !== expected.size) {
      throw new Error('Gemini Vietnamese-title response ID set is incomplete');
    }
    const byId = new Map((value as VietnameseTitleResult[]).map(result => [result.id, result]));
    return inputs.map(input => byId.get(input.id)!);
  }
}
