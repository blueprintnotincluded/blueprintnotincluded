import { CAPS, PROMPT_VERSIONS } from './constants';
import { DiacriticCase } from './types';

export type LlmMode = 'end-to-end' | 'restore';

const SHARED_PROMPT = `Inputs are user-authored Oxygen Not Included blueprint titles that may be Vietnamese typed without diacritics. Use ONI context only to disambiguate; never invent absent details. Preserve digits, version markers, punctuation, and ASCII game jargon such as SPOM. Return English or acronym-only controls unchanged. If meaning is genuinely underdetermined, use status "ambiguous" and at most three plausible alternatives instead of guessing. Return only data matching the schema.`;

export function responseSchema(mode: LlmMode): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    id: { type: 'string' },
    status: { type: 'string', enum: ['resolved', 'ambiguous'] },
    restoredVi: { type: 'string' },
    alternatives: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  };
  const required = ['id', 'status', 'restoredVi', 'alternatives'];
  if (mode === 'end-to-end') {
    properties.english = { type: 'string' };
    required.push('english');
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      results: {
        type: 'array',
        minItems: CAPS.fixtureCases,
        maxItems: CAPS.fixtureCases,
        items: { type: 'object', additionalProperties: false, properties, required },
      },
    },
    required: ['results'],
  };
}

export interface GeminiRequestBody {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: 'user'; parts: { text: string }[] }[];
  generationConfig: {
    temperature: 0;
    candidateCount: 1;
    maxOutputTokens: number;
    responseMimeType: 'application/json';
    responseJsonSchema: Record<string, unknown>;
    thinkingConfig: { thinkingBudget: 0 };
  };
}

export function buildGeminiRequest(cases: DiacriticCase[], mode: LlmMode): GeminiRequestBody {
  const inputs = cases.map(item => ({ id: item.id, text: item.asciiInput }));
  const task =
    mode === 'end-to-end'
      ? 'Restore the intended Vietnamese and translate its meaning to English.'
      : 'Restore the intended Vietnamese only; do not translate it to English.';
  const version = mode === 'end-to-end' ? PROMPT_VERSIONS.endToEnd : PROMPT_VERSIONS.restore;
  return {
    systemInstruction: { parts: [{ text: `${version}\n${SHARED_PROMPT}\n${task}` }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ inputs }) }] }],
    generationConfig: {
      temperature: 0,
      candidateCount: CAPS.geminiCandidates,
      maxOutputTokens: CAPS.geminiOutputTokensPerCall,
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema(mode),
      thinkingConfig: { thinkingBudget: CAPS.geminiThinkingBudget },
    },
  };
}
