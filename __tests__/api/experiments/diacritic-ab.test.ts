import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ArtifactStore, sha256 } from '../../../app/api/experiments/diacritic-ab/artifacts';
import {
  assertDoRequestWithinCap,
  assertGoogleCharacters,
  calculateMaximumCost,
  fullReservation,
} from '../../../app/api/experiments/diacritic-ab/caps';
import {
  DigitalOceanExperimentClient,
  GoogleExperimentClient,
  GoogleTransport,
  validateLlmOutputs,
} from '../../../app/api/experiments/diacritic-ab/clients';
import { DO_ENDPOINT, DO_MODEL } from '../../../app/api/experiments/diacritic-ab/constants';
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
import { buildDoRequest } from '../../../app/api/experiments/diacritic-ab/prompts';
import {
  ArmOutput,
  ArmResult,
  HttpRequest,
  HttpTransport,
} from '../../../app/api/experiments/diacritic-ab/types';
import { loadReviewed402Continuation } from '../../../app/api/experiments/translate-diacritic-ab';

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
      expect(calculateMaximumCost()).to.equal(0.0175104);
      expect(fullReservation()).to.deep.include({
        doCalls: 2,
        googleCalls: 3,
        doInputTokens: 8192,
        doOutputTokens: 1536,
        googleSourceCharacters: 768,
        maximumUsd: 0.0175104,
      });
    });

    it('accepts exact per-request boundaries and rejects one unit over', () => {
      expect(assertDoRequestWithinCap('x'.repeat(4032))).to.equal(4096);
      expect(() => assertDoRequestWithinCap('x'.repeat(4033))).to.throw('per-call cap');
      expect(assertGoogleCharacters(['x'.repeat(256)], 256)).to.equal(256);
      expect(() => assertGoogleCharacters(['x'.repeat(257)], 256)).to.throw('source characters');
    });
  });

  describe('prompt serialization', () => {
    it('pins model/settings and keeps evaluation ground truth out of both requests', () => {
      for (const mode of ['end-to-end', 'restore'] as const) {
        const request = buildDoRequest(cases, mode);
        const serialized = JSON.stringify(request);
        expect(request.model).to.equal(DO_MODEL);
        expect(request.temperature).to.equal(0);
        expect(request.max_completion_tokens).to.equal(768);
        expect(request.response_format.type).to.equal('json_schema');
        expect(serialized).not.to.contain('canonicalVietnamese');
        expect(serialized).not.to.contain('acceptableEnglish');
        expect(serialized).not.to.contain('reviewerNote');
        expect(serialized).not.to.contain('Điện phân');
        expect(serialized).not.to.contain('Electrolysis');
        expect(serialized).not.to.contain('Short tone collision');
        expect(assertDoRequestWithinCap(serialized)).to.be.at.most(4096);
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

    it('pins the DO endpoint/model and validates complete aligned output and usage', async () => {
      const requests: HttpRequest[] = [];
      const outputs = resolvedOutputs(false);
      const transport: HttpTransport = {
        async send(request) {
          requests.push(request);
          if (request.method === 'GET') return { status: 200, body: { data: [{ id: DO_MODEL }] } };
          return {
            status: 200,
            body: {
              choices: [{ message: { content: JSON.stringify({ results: outputs }) } }],
              usage: { prompt_tokens: 400, completion_tokens: 200 },
            },
          };
        },
      };
      const client = new DigitalOceanExperimentClient(transport);
      await client.assertModelAvailable();
      const result = await client.complete(buildDoRequest(cases, 'restore'), cases, 'restore');
      expect(result.outputs).to.deep.equal(outputs);
      expect(result.usage).to.deep.equal({ promptTokens: 400, completionTokens: 200 });
      expect(requests[0].url).to.equal(`${DO_ENDPOINT}/v1/models`);
      expect(requests[1].url).to.equal(`${DO_ENDPOINT}/v1/chat/completions`);
      expect(JSON.parse(requests[1].body!).model).to.equal(DO_MODEL);
    });

    it('captures a raw DO response before failing closed on missing usage', async () => {
      const raw = {
        choices: [{ message: { content: JSON.stringify({ results: resolvedOutputs(false) }) } }],
      };
      const transport: HttpTransport = {
        async send() {
          return { status: 200, body: raw };
        },
      };
      let captured: unknown;
      const client = new DigitalOceanExperimentClient(transport);
      try {
        await client.complete(buildDoRequest(cases, 'restore'), cases, 'restore', value => {
          captured = value;
        });
        expect.fail('missing usage should fail');
      } catch (error) {
        expect((error as Error).message).to.contain('omitted token usage');
      }
      expect(captured).to.equal(raw);
    });

    it('captures a raw DO error body before failing closed on HTTP 402', async () => {
      const raw = { id: 'payment_required', message: 'Prepayment required' };
      const transport: HttpTransport = {
        async send() {
          return { status: 402, body: raw };
        },
      };
      let captured: unknown;
      const client = new DigitalOceanExperimentClient(transport);
      try {
        await client.complete(buildDoRequest(cases, 'restore'), cases, 'restore', value => {
          captured = value;
        });
        expect.fail('HTTP 402 should fail');
      } catch (error) {
        expect((error as Error).message).to.contain('HTTP 402');
      }
      expect(captured).to.equal(raw);
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

    it('accepts only the exact reviewed 402 continuation artifacts once', () => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diacritic-resume-'));
      const store = new ArtifactStore(directory);
      const fixtureHash = sha256(
        fs.readFileSync('app/api/experiments/fixtures/vi-diacritic-cases.json')
      );
      const sourceCharacters = cases.reduce((sum, item) => sum + item.asciiInput.length, 0);
      const googleAuto: ArmResult = {
        arm: 'google-auto',
        outputs: resolvedOutputs(true).map(({ restoredVi: _restoredVi, ...output }) => output),
        googleSourceCharacters: sourceCharacters,
      };
      const googleVi: ArmResult = {
        arm: 'google-vi',
        outputs: resolvedOutputs(true).map(({ restoredVi: _restoredVi, ...output }) => output),
        googleSourceCharacters: sourceCharacters,
      };
      store.writeJson('reservation.json', {
        state: 'failed',
        failure: 'DO completion request failed with HTTP 402',
        calls: { digitalOcean: 2, google: 3 },
        manifestFixtureSha256: fixtureHash,
      });
      store.writeJson('results.json', {
        partial: true,
        arms: [googleAuto, googleVi],
        operationalFailure: {
          arm: 'llm-end-to-end',
          message: 'DO completion request failed with HTTP 402',
        },
      });
      store.writeJson('responses/google-auto.json', { data: {} });
      store.writeJson('responses/google-vi.json', { data: {} });

      expect(loadReviewed402Continuation(store, cases, fixtureHash).results).to.deep.equal([
        googleAuto,
        googleVi,
      ]);
      store.writeJson('reservation.json', {
        ...(store.read('reservation.json') as Record<string, unknown>),
        resume: { authorizedAt: new Date().toISOString() },
      });
      expect(() => loadReviewed402Continuation(store, cases, fixtureHash)).to.throw(
        'single reviewed HTTP 402 state'
      );
    });

    it('computes mechanical measures/cost and emits a blinded review mapping', () => {
      const arms: ArmResult[] = [
        { arm: 'google-auto', outputs: resolvedOutputs(true), googleSourceCharacters: 125 },
        { arm: 'google-vi', outputs: resolvedOutputs(true), googleSourceCharacters: 125 },
        {
          arm: 'llm-end-to-end',
          outputs: resolvedOutputs(true),
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          arm: 'restore-google',
          outputs: resolvedOutputs(true),
          usage: { promptTokens: 100, completionTokens: 50 },
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
