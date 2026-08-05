import { CAPS, DO_MODEL, PROMPT_VERSIONS } from './constants';
import { DiacriticCase } from './types';

export type LlmMode = 'end-to-end' | 'restore';

const SHARED_PROMPT = `Inputs are user-authored Oxygen Not Included blueprint titles that may be Vietnamese typed without diacritics. Use ONI context only to disambiguate; never invent absent details. Preserve digits, version markers, punctuation, and ASCII game jargon such as SPOM. Return English or acronym-only controls unchanged. If meaning is genuinely underdetermined, use status "ambiguous" and at most three plausible alternatives instead of guessing. Return only data matching the schema.`;

function responseSchema(mode: LlmMode): Record<string, unknown> {
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

export interface DoRequestBody {
  model: typeof DO_MODEL;
  messages: { role: 'system' | 'user'; content: string }[];
  temperature: 0;
  max_completion_tokens: number;
  response_format: {
    type: 'json_schema';
    json_schema: { name: string; strict: true; schema: Record<string, unknown> };
  };
}

export function buildDoRequest(cases: DiacriticCase[], mode: LlmMode): DoRequestBody {
  // Only IDs and experiment inputs enter the provider layer. Ground truth and
  // reviewer notes remain in fixture/evaluation code.
  const inputs = cases.map(item => ({ id: item.id, text: item.asciiInput }));
  const task =
    mode === 'end-to-end'
      ? 'Restore the intended Vietnamese and translate its meaning to English.'
      : 'Restore the intended Vietnamese only; do not translate it to English.';
  const version = mode === 'end-to-end' ? PROMPT_VERSIONS.endToEnd : PROMPT_VERSIONS.restore;
  return {
    model: DO_MODEL,
    messages: [
      { role: 'system', content: `${version}\n${SHARED_PROMPT}\n${task}` },
      { role: 'user', content: JSON.stringify({ inputs }) },
    ],
    temperature: 0,
    max_completion_tokens: CAPS.doOutputTokensPerCall,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `vi_diacritic_${mode.replace(/-/g, '_')}`,
        strict: true,
        schema: responseSchema(mode),
      },
    },
  };
}
