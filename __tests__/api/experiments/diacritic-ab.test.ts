import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ArtifactStore } from '../../../app/api/experiments/diacritic-ab/artifacts';
import {
  assertGeminiRequestWithinCap,
  assertGoogleCharacters,
  calculateMaximumCost,
  fullReservation,
} from '../../../app/api/experiments/diacritic-ab/caps';
import {
  createGeminiFetchTransport,
  GeminiExperimentClient,
  GoogleExperimentClient,
  GoogleTransport,
  validateLlmOutputs,
} from '../../../app/api/experiments/diacritic-ab/clients';
import {
  EXPERIMENT_REVISION,
  GEMINI_ENDPOINT,
  GEMINI_MODEL,
} from '../../../app/api/experiments/diacritic-ab/constants';
import {
  blindResults,
  mechanicalRows,
  observedCost,
} from '../../../app/api/experiments/diacritic-ab/evaluation';
import {
  loadFixture,
  stripVietnameseDiacritics,
  validateFixture,
} from '../../../app/api/experiments/diacritic-ab/fixture';
import { buildGeminiRequest } from '../../../app/api/experiments/diacritic-ab/prompts';
import {
  ArmOutput,
  ArmResult,
  HttpRequest,
  HttpTransport,
} from '../../../app/api/experiments/diacritic-ab/types';
import { makeManifest, parseCli } from '../../../app/api/experiments/translate-diacritic-ab';

describe('diacritic A/B experiment', () => {
  const cases = loadFixture();

  describe('fixture and stripping', () => {
    it('strips combining marks and Vietnamese d with stroke', () => {
      expect(stripVietnameseDiacritics('Điện phân nước ĐẦY')).to.equal('Dien phan nuoc DAY');
      expect(stripVietnameseDiacritics('a\u0301')).to.equal('a');
    });

    it('loads the fixed category mix within the hard character cap', () => {
      expect(cases).to.have.length(12);
      expect(new Set(cases.map(item => item.id)).size).to.equal(12);
      expect(cases.filter(item => item.category === 'live')).to.have.length(2);
      expect(cases.filter(item => item.category === 'synthetic')).to.have.length(6);
      expect(cases.filter(item => item.category === 'ambiguous')).to.have.length(2);
      expect(cases.filter(item => item.category === 'control')).to.have.length(2);
      expect(cases.reduce((sum, item) => sum + item.asciiInput.length, 0)).to.be.at.most(256);
    });

    it('rejects duplicates, non-ASCII input, and non-mechanical synthetic input', () => {
      const duplicate = cases.map(item => ({ ...item }));
      duplicate[1].id = duplicate[0].id;
      expect(() => validateFixture(duplicate)).to.throw('Duplicate fixture id');
      const nonAscii = cases.map(item => ({ ...item }));
      nonAscii[0].asciiInput = 'Điện phân';
      expect(() => validateFixture(nonAscii)).to.throw('not ASCII');
      const mismatched = cases.map(item => ({ ...item }));
      mismatched.find(item => item.category === 'synthetic')!.asciiInput = 'wrong';
      expect(() => validateFixture(mismatched)).to.throw('not mechanically stripped');
    });
  });

  describe('caps', () => {
    it('calculates the acknowledged worst case exactly', () => {
      expect(calculateMaximumCost()).to.equal(0.0167936);
      expect(fullReservation()).to.deep.include({
        geminiCalls: 2,
        googleCalls: 3,
        geminiInputTokens: 8192,
        geminiOutputTokens: 1536,
        googleSourceCharacters: 768,
        maximumUsd: 0.0167936,
      });
    });

    it('accepts exact per-request boundaries and rejects one unit over', () => {
      expect(assertGeminiRequestWithinCap('x'.repeat(4032))).to.equal(4096);
      expect(() => assertGeminiRequestWithinCap('x'.repeat(4033))).to.throw('per-call cap');
      expect(assertGoogleCharacters(['x'.repeat(256)], 256)).to.equal(256);
      expect(() => assertGoogleCharacters(['x'.repeat(257)], 256)).to.throw('source characters');
    });
  });

  describe('prompt serialization', () => {
    it('pins model/settings and keeps evaluation ground truth out of both requests', () => {
      for (const mode of ['end-to-end', 'restore'] as const) {
        const request = buildGeminiRequest(cases, mode);
        const serialized = JSON.stringify(request);
        expect(request.generationConfig.temperature).to.equal(0);
        expect(request.generationConfig.candidateCount).to.equal(1);
        expect(request.generationConfig.maxOutputTokens).to.equal(768);
        expect(request.generationConfig.thinkingConfig.thinkingBudget).to.equal(0);
        expect(request.generationConfig.responseMimeType).to.equal('application/json');
        expect(request.generationConfig.responseJsonSchema).to.be.an('object');
        expect(request).not.to.have.property('tools');
        expect(request).not.to.have.property('cachedContent');
        expect(serialized).not.to.contain('canonicalVietnamese');
        expect(serialized).not.to.contain('acceptableEnglish');
        expect(serialized).not.to.contain('reviewerNote');
        expect(serialized).not.to.contain('Điện phân');
        expect(serialized).not.to.contain('Electrolysis');
        expect(serialized).not.to.contain('Short tone collision');
        expect(assertGeminiRequestWithinCap(serialized)).to.be.at.most(4096);
      }
    });
  });

  describe('experiment clients', () => {
    it('sends one Google batch with auto detection and one with forced Vietnamese', async () => {
      const calls: { texts: string[]; options: unknown }[] = [];
      const transport: GoogleTransport = {
        async translate(texts, options) {
          calls.push({ texts, options });
          return [texts.map(text => `translated:${text}`), { data: { translations: [] } }];
        },
      };
      const client = new GoogleExperimentClient(transport);
      await client.translate(
        cases.map(item => item.asciiInput),
        'auto'
      );
      await client.translate(
        cases.map(item => item.asciiInput),
        'vi'
      );
      expect(calls).to.have.length(2);
      expect(calls[0].options).to.deep.equal({ to: 'en', format: 'text' });
      expect(calls[1].options).to.deep.equal({ to: 'en', format: 'text', from: 'vi' });
      expect(calls[0].texts).to.have.length(12);
    });

    it('pins the Gemini endpoint/model and validates complete aligned output and usage', async () => {
      const requests: HttpRequest[] = [];
      const outputs = resolvedOutputs(false);
      const transport: HttpTransport = {
        async send(request) {
          requests.push(request);
          if (request.method === 'GET') {
            return { status: 200, body: { name: `models/${GEMINI_MODEL}` } };
          }
          return {
            status: 200,
            body: {
              candidates: [
                {
                  finishReason: 'STOP',
                  content: { parts: [{ text: JSON.stringify({ results: outputs }) }] },
                },
              ],
              usageMetadata: {
                promptTokenCount: 400,
                candidatesTokenCount: 200,
                totalTokenCount: 600,
              },
            },
          };
        },
      };
      const client = new GeminiExperimentClient(transport);
      await client.assertModelAvailable();
      const result = await client.complete(buildGeminiRequest(cases, 'restore'), cases, 'restore');
      expect(result.outputs).to.deep.equal(outputs);
      expect(result.usage).to.deep.equal({
        promptTokens: 400,
        completionTokens: 200,
        thoughtTokens: 0,
        totalTokens: 600,
      });
      expect(requests[0].url).to.equal(`${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}`);
      expect(requests[1].url).to.equal(`${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}:generateContent`);
      const body = JSON.parse(requests[1].body!);
      expect(body.generationConfig.thinkingConfig).to.deep.equal({ thinkingBudget: 0 });
    });

    it('captures a raw Gemini response before failing closed on missing usage', async () => {
      const raw = {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify({ results: resolvedOutputs(false) }) }] },
          },
        ],
      };
      const transport: HttpTransport = {
        async send() {
          return { status: 200, body: raw };
        },
      };
      let captured: unknown;
      const client = new GeminiExperimentClient(transport);
      try {
        await client.complete(buildGeminiRequest(cases, 'restore'), cases, 'restore', value => {
          captured = value;
        });
        expect.fail('missing usage should fail');
      } catch (error) {
        expect((error as Error).message).to.contain('omitted token usage');
      }
      expect(captured).to.equal(raw);
    });

    it('captures a raw Gemini error body before failing closed on HTTP errors', async () => {
      const raw = { error: { code: 429, message: 'Quota exceeded' } };
      const transport: HttpTransport = {
        async send() {
          return { status: 429, body: raw };
        },
      };
      let captured: unknown;
      const client = new GeminiExperimentClient(transport);
      try {
        await client.complete(buildGeminiRequest(cases, 'restore'), cases, 'restore', value => {
          captured = value;
        });
        expect.fail('HTTP 429 should fail');
      } catch (error) {
        expect((error as Error).message).to.contain('HTTP 429');
      }
      expect(captured).to.equal(raw);
    });

    it('fails closed on blocked or truncated Gemini candidates', async () => {
      for (const body of [
        { promptFeedback: { blockReason: 'SAFETY' } },
        {
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: { parts: [{ text: JSON.stringify({ results: resolvedOutputs(false) }) }] },
            },
          ],
        },
      ]) {
        const client = new GeminiExperimentClient({
          async send() {
            return { status: 200, body };
          },
        });
        try {
          await client.complete(buildGeminiRequest(cases, 'restore'), cases, 'restore');
          expect.fail('blocked or truncated output should fail');
        } catch (error) {
          expect((error as Error).message).to.match(/blocked|did not finish normally/);
        }
      }
    });

    it('puts the Gemini key only in the API-key header', async () => {
      const originalFetch = global.fetch;
      let observedUrl: string | undefined;
      let observedHeaders: Record<string, string> | undefined;
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        observedUrl = String(input);
        observedHeaders = init?.headers as Record<string, string>;
        return {
          status: 200,
          async text() {
            return '{}';
          },
        } as Response;
      }) as typeof fetch;
      try {
        await createGeminiFetchTransport('test-secret').send({
          url: `${GEMINI_ENDPOINT}/models/${GEMINI_MODEL}`,
          method: 'GET',
          headers: {},
          timeoutMs: 100,
        });
      } finally {
        global.fetch = originalFetch;
      }
      expect(observedUrl).not.to.contain('test-secret');
      expect(observedHeaders).to.deep.equal({ 'x-goog-api-key': 'test-secret' });
      expect(observedHeaders).not.to.have.property('authorization');
    });

    it('rejects missing, duplicate, unknown, and extra output IDs', () => {
      const base = resolvedOutputs(false);
      expect(() => validateLlmOutputs(base.slice(1), cases, 'restore')).to.throw('exactly 12');
      const duplicate = base.map(item => ({ ...item }));
      duplicate[1].id = duplicate[0].id;
      expect(() => validateLlmOutputs(duplicate, cases, 'restore')).to.throw('malformed row');
      const unknown = base.map(item => ({ ...item }));
      unknown[0].id = 'unknown';
      expect(() => validateLlmOutputs(unknown, cases, 'restore')).to.throw('malformed row');
      expect(() => validateLlmOutputs([...base, base[0]], cases, 'restore')).to.throw('exactly 12');
    });
  });

  describe('artifacts and evaluation', () => {
    let directory: string;
    afterEach(() => {
      if (directory) fs.rmSync(directory, { recursive: true, force: true });
    });

    it('creates a reservation once and refuses to overwrite it', () => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diacritic-ledger-'));
      const store = new ArtifactStore(directory);
      store.createReservation({ state: 'reserved', usd: 0.02 });
      expect(store.read('reservation.json')).to.deep.equal({ state: 'reserved', usd: 0.02 });
      expect(() => store.createReservation({ state: 'reserved' })).to.throw('already exists');
    });

    it('uses a distinct Gemini v2 identity rather than a continuation mode', () => {
      expect(() => parseCli(['--resume-reviewed-402'], 'development')).to.throw('Unknown argument');
      const { manifest } = makeManifest(process.cwd(), cases);
      expect(manifest.experiment).to.equal(EXPERIMENT_REVISION);
      expect(manifest.provider.gemini.model).to.equal(GEMINI_MODEL);
      expect(manifest.identities.llmEndToEnd).to.be.a('string').with.length(64);
      expect(manifest.reservation.maximumUsd).to.equal(0.0167936);
    });

    it('rejects live execution in tests and requires the exact acknowledgement', () => {
      expect(() => parseCli(['--execute'], 'development')).to.throw('exact acknowledgement');
      expect(() => parseCli(['--ack-max-usd=0.02'], 'development')).to.throw(
        'valid only with --execute'
      );
      expect(() => parseCli(['--execute', '--ack-max-usd=0.02'], 'test')).to.throw(
        'disabled when NODE_ENV=test'
      );
      expect(parseCli(['--execute', '--ack-max-usd=0.02'], 'development')).to.deep.equal({
        mode: 'execute',
      });
    });

    it('computes mechanical measures/cost and emits a blinded review mapping', () => {
      const arms: ArmResult[] = [
        { arm: 'google-auto', outputs: resolvedOutputs(true), googleSourceCharacters: 125 },
        { arm: 'google-vi', outputs: resolvedOutputs(true), googleSourceCharacters: 125 },
        {
          arm: 'llm-end-to-end',
          outputs: resolvedOutputs(true),
          usage: { promptTokens: 100, completionTokens: 50, thoughtTokens: 0, totalTokens: 150 },
        },
        {
          arm: 'restore-google',
          outputs: resolvedOutputs(true),
          usage: { promptTokens: 100, completionTokens: 50, thoughtTokens: 0, totalTokens: 150 },
          googleSourceCharacters: 130,
        },
      ];
      expect(mechanicalRows(cases, arms)).to.have.length(48);
      const changedControl = resolvedOutputs(true);
      changedControl.find(item => item.id === 'control-main-base')!.english = 'Main Base';
      const controlMetric = mechanicalRows(cases, [
        { arm: 'google-auto', outputs: changedControl },
      ]).find(item => item.id === 'control-main-base')!;
      expect(controlMetric.noOp).to.equal(true);
      expect(controlMetric.controlPreserved).to.equal(false);
      expect(observedCost(arms).complete).to.equal(true);
      expect(observedCost(arms).usd).to.be.greaterThan(0);
      const blind = blindResults(cases, arms);
      expect(Object.keys(blind.mapping)).to.have.members(['A', 'B', 'C', 'D']);
      expect(blind.review).to.contain('Do not unblind arm labels');
      expect(blind.review).not.to.contain('google-auto');
    });
  });

  function resolvedOutputs(withEnglish: boolean): ArmOutput[] {
    return cases.map(item => ({
      id: item.id,
      status: 'resolved',
      restoredVi: item.canonicalVietnamese ?? item.asciiInput,
      ...(withEnglish ? { english: item.acceptableEnglish?.[0] ?? item.asciiInput } : {}),
      alternatives: [],
    }));
  }
});
