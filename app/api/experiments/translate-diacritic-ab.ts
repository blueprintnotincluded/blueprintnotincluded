import fs from 'fs';
import path from 'path';
import { Translate } from '@google-cloud/translate/build/src/v2';
import dotenv from 'dotenv';
import { ArtifactStore, sha256 } from './diacritic-ab/artifacts';
import {
  assertDoRequestWithinCap,
  assertGoogleCharacters,
  fullReservation,
} from './diacritic-ab/caps';
import {
  createFetchTransport,
  DigitalOceanExperimentClient,
  GoogleExperimentClient,
} from './diacritic-ab/clients';
import {
  ARTIFACT_DIR,
  CAPS,
  DO_ENDPOINT,
  DO_MODEL,
  FIXTURE_PATH,
  PROMPT_VERSIONS,
  RATES,
} from './diacritic-ab/constants';
import { blindResults, mechanicalRows, observedCost } from './diacritic-ab/evaluation';
import { loadFixture } from './diacritic-ab/fixture';
import { buildDoRequest } from './diacritic-ab/prompts';
import { ArmOutput, ArmResult, DiacriticCase, ExperimentArm } from './diacritic-ab/types';

interface CliOptions {
  mode: 'dry-run' | 'execute' | 'resume-reviewed-402';
  acknowledged: boolean;
}

function parseCli(argv: string[]): CliOptions {
  const allowed = new Set(['--execute', '--resume-reviewed-402', '--ack-max-usd=0.02']);
  const unknown = argv.filter(arg => !allowed.has(arg));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  const execute = argv.includes('--execute');
  const resume = argv.includes('--resume-reviewed-402');
  const acknowledged = argv.includes('--ack-max-usd=0.02');
  if (execute && resume)
    throw new Error('--execute and --resume-reviewed-402 are mutually exclusive');
  if (!execute && !resume && acknowledged) {
    throw new Error('The acknowledgement is valid only with a live execution mode');
  }
  if ((execute || resume) && !acknowledged) {
    throw new Error('Live execution requires the exact acknowledgement --ack-max-usd=0.02');
  }
  return { mode: resume ? 'resume-reviewed-402' : execute ? 'execute' : 'dry-run', acknowledged };
}

function promptHash(request: ReturnType<typeof buildDoRequest>): string {
  const withoutInputs = {
    ...request,
    messages: request.messages.map(message =>
      message.role === 'user' ? { ...message, content: '<fixture-inputs>' } : message
    ),
  };
  return sha256(JSON.stringify(withoutInputs));
}

function cacheIdentity(
  arm: ExperimentArm,
  provider: string,
  promptVersion: string,
  fixtureHash: string
): string {
  return sha256(`${arm}\n${provider}\n${promptVersion}\n${fixtureHash}`);
}

function makeManifest(rootDir: string, cases: DiacriticCase[]) {
  const fixtureBytes = fs.readFileSync(path.resolve(rootDir, FIXTURE_PATH));
  const fixtureHash = sha256(fixtureBytes);
  const endToEnd = buildDoRequest(cases, 'end-to-end');
  const restore = buildDoRequest(cases, 'restore');
  const serializedEndToEnd = JSON.stringify(endToEnd);
  const serializedRestore = JSON.stringify(restore);
  const sourceCharacters = cases.reduce((sum, item) => sum + item.asciiInput.length, 0);
  const reservation = fullReservation();
  const manifest = {
    experiment: 'vi-diacritic-ab-v1',
    createdAt: new Date().toISOString(),
    fixture: { path: FIXTURE_PATH, sha256: fixtureHash, cases: cases.length, sourceCharacters },
    prompts: {
      endToEnd: { version: PROMPT_VERSIONS.endToEnd, sha256: promptHash(endToEnd) },
      restore: { version: PROMPT_VERSIONS.restore, sha256: promptHash(restore) },
    },
    provider: {
      digitalOcean: { endpoint: DO_ENDPOINT, model: DO_MODEL },
      google: { api: 'basic-v2' },
    },
    requestReservations: {
      doEndToEndInputTokens: assertDoRequestWithinCap(serializedEndToEnd),
      doRestoreInputTokens: assertDoRequestWithinCap(serializedRestore),
      doOutputTokensPerCall: CAPS.doOutputTokensPerCall,
      googleCharactersPerFixtureBatch: assertGoogleCharacters(
        cases.map(item => item.asciiInput),
        CAPS.sourceCharacters
      ),
    },
    calls: { digitalOceanInference: 2, googleTranslation: 3, retries: 0, concurrency: 1 },
    rates: RATES,
    rateSources: {
      digitalOcean: 'https://docs.digitalocean.com/products/inference/details/pricing/',
      google: 'https://cloud.google.com/translate/pricing',
    },
    caps: CAPS,
    reservation,
    identities: {
      googleAuto: cacheIdentity('google-auto', 'google-basic-v2', 'batch-auto-v1', fixtureHash),
      googleVi: cacheIdentity('google-vi', 'google-basic-v2', 'batch-forced-vi-v1', fixtureHash),
      llmEndToEnd: cacheIdentity('llm-end-to-end', DO_MODEL, PROMPT_VERSIONS.endToEnd, fixtureHash),
      restoreGoogle: cacheIdentity(
        'restore-google',
        `${DO_MODEL}+google-basic-v2`,
        PROMPT_VERSIONS.restore,
        fixtureHash
      ),
    },
  };
  return { manifest, endToEnd, restore, reservation };
}

function printPreflight(
  manifest: ReturnType<typeof makeManifest>['manifest'],
  mode: CliOptions['mode']
): void {
  console.log(JSON.stringify(manifest, null, 2));
  if (mode === 'execute') {
    console.log(
      `Live execution acknowledged. Reserving exactly 2 DO calls, 3 Google calls, and $${manifest.reservation.maximumUsd.toFixed(7)} maximum calculated usage ($0.02 fail-closed ledger).`
    );
  } else if (mode === 'resume-reviewed-402') {
    console.log(
      'Reviewed HTTP 402 continuation acknowledged. Reusing 2 captured Google arms and reserving only the remaining 2 DO calls plus 1 Google call.'
    );
  } else {
    console.log(
      'Offline dry run complete. No live client was constructed and no provider request was sent.'
    );
  }
}

function googleOutputs(cases: DiacriticCase[], texts: string[]): ArmOutput[] {
  return cases.map((item, index) => ({
    id: item.id,
    status: 'resolved',
    english: texts[index],
    alternatives: [],
  }));
}

function armGoogleCharacters(...values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

interface Reviewed402Reservation {
  state?: unknown;
  failure?: unknown;
  calls?: { digitalOcean?: unknown; google?: unknown };
  manifestFixtureSha256?: unknown;
  resume?: unknown;
  [key: string]: unknown;
}

interface PartialResultsArtifact {
  partial?: unknown;
  arms?: unknown;
  operationalFailure?: { arm?: unknown; message?: unknown };
}

function validateCapturedGoogleArm(
  value: unknown,
  expectedArm: 'google-auto' | 'google-vi',
  cases: DiacriticCase[]
): ArmResult {
  const arm = value as Partial<ArmResult>;
  const expectedIds = new Set(cases.map(item => item.id));
  const outputs = arm.outputs;
  if (
    arm.arm !== expectedArm ||
    !Array.isArray(outputs) ||
    outputs.length !== cases.length ||
    arm.googleSourceCharacters !== cases.reduce((sum, item) => sum + item.asciiInput.length, 0)
  ) {
    throw new Error(`Captured ${expectedArm} arm does not match the reviewed fixture`);
  }
  const seen = new Set<string>();
  for (const output of outputs) {
    if (
      typeof output.id !== 'string' ||
      !expectedIds.has(output.id) ||
      seen.has(output.id) ||
      output.status !== 'resolved' ||
      typeof output.english !== 'string' ||
      !Array.isArray(output.alternatives) ||
      output.alternatives.length !== 0
    ) {
      throw new Error(`Captured ${expectedArm} output is incomplete or misaligned`);
    }
    seen.add(output.id);
  }
  return arm as ArmResult;
}

export function loadReviewed402Continuation(
  store: ArtifactStore,
  cases: DiacriticCase[],
  fixtureHash: string
): { reservation: Reviewed402Reservation; results: ArmResult[] } {
  if (!store.exists('reservation.json') || !store.exists('results.json')) {
    throw new Error('Reviewed HTTP 402 continuation requires reservation.json and results.json');
  }
  const reservation = store.read('reservation.json') as Reviewed402Reservation;
  const partial = store.read('results.json') as PartialResultsArtifact;
  if (
    reservation.state !== 'failed' ||
    reservation.failure !== 'DO completion request failed with HTTP 402' ||
    reservation.calls?.digitalOcean !== CAPS.doCalls ||
    reservation.calls?.google !== CAPS.googleCalls ||
    reservation.manifestFixtureSha256 !== fixtureHash ||
    reservation.resume != null
  ) {
    throw new Error(
      'Reservation is not the single reviewed HTTP 402 state authorized for continuation'
    );
  }
  if (
    partial.partial !== true ||
    partial.operationalFailure?.arm !== 'llm-end-to-end' ||
    partial.operationalFailure.message !== 'DO completion request failed with HTTP 402' ||
    !Array.isArray(partial.arms) ||
    partial.arms.length !== 2
  ) {
    throw new Error('Partial results are not the reviewed two-Google-arm HTTP 402 artifact');
  }
  for (const name of ['llm-end-to-end.json', 'llm-restore.json', 'restore-google.json']) {
    if (fs.existsSync(path.join(store.responsesDir, name))) {
      throw new Error(`Cannot continue because responses/${name} already exists`);
    }
  }
  for (const name of ['google-auto.json', 'google-vi.json']) {
    if (!fs.existsSync(path.join(store.responsesDir, name))) {
      throw new Error(`Cannot continue without responses/${name}`);
    }
  }
  return {
    reservation,
    results: [
      validateCapturedGoogleArm(partial.arms[0], 'google-auto', cases),
      validateCapturedGoogleArm(partial.arms[1], 'google-vi', cases),
    ],
  };
}

async function executeLive(
  store: ArtifactStore,
  cases: DiacriticCase[],
  endToEndRequest: ReturnType<typeof buildDoRequest>,
  restoreRequest: ReturnType<typeof buildDoRequest>,
  manifest: ReturnType<typeof makeManifest>['manifest'],
  reservation: ReturnType<typeof fullReservation>
): Promise<void> {
  if (store.exists('reservation.json')) {
    console.log(JSON.stringify(store.read('reservation.json'), null, 2));
    if (store.exists('results.json')) {
      console.log(JSON.stringify(store.read('results.json'), null, 2));
    }
    throw new Error(
      'Reservation already exists; captured or partial results require manual review'
    );
  }
  dotenv.config();
  const doKey = process.env.DO_INFERENCE_API_KEY;
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!doKey || !googleKey) {
    throw new Error('DO_INFERENCE_API_KEY and GOOGLE_TRANSLATE_API_KEY are required for --execute');
  }
  const now = new Date().toISOString();
  store.createReservation({
    state: 'reserved',
    reservedAt: now,
    updatedAt: now,
    calls: { digitalOcean: reservation.doCalls, google: reservation.googleCalls },
    tokens: { input: reservation.doInputTokens, output: reservation.doOutputTokens },
    googleSourceCharacters: reservation.googleSourceCharacters,
    usd: CAPS.acknowledgedUsd,
    calculatedMaximumUsd: reservation.maximumUsd,
    manifestFixtureSha256: manifest.fixture.sha256,
  });
  const updateReservation = (
    state: 'running' | 'complete' | 'failed',
    extra: Record<string, unknown> = {}
  ) =>
    store.writeJson('reservation.json', {
      ...(store.read('reservation.json') as Record<string, unknown>),
      state,
      updatedAt: new Date().toISOString(),
      ...extra,
    });

  const doClient = new DigitalOceanExperimentClient(createFetchTransport(doKey));
  const googleSdk = new Translate({ key: googleKey, autoRetry: false, maxRetries: 0 });
  const googleClient = new GoogleExperimentClient(googleSdk);
  const inputs = cases.map(item => item.asciiInput);
  const results: ArmResult[] = [];
  let currentOperation = 'model-access';
  const persistPartialResults = () =>
    store.writeJson('results.json', {
      partial: true,
      updatedAt: new Date().toISOString(),
      arms: results,
      mechanical: mechanicalRows(cases, results),
      observedCost: observedCost(results),
    });
  try {
    updateReservation('running');
    await doClient.assertModelAvailable();

    currentOperation = 'google-auto';
    const googleAuto = await googleClient.translate(inputs, 'auto', raw =>
      store.writeJson('responses/google-auto.json', raw)
    );
    results.push({
      arm: 'google-auto',
      outputs: googleOutputs(cases, googleAuto.texts),
      googleSourceCharacters: googleAuto.sourceCharacters,
    });
    persistPartialResults();

    currentOperation = 'google-vi';
    const googleVi = await googleClient.translate(inputs, 'vi', raw =>
      store.writeJson('responses/google-vi.json', raw)
    );
    results.push({
      arm: 'google-vi',
      outputs: googleOutputs(cases, googleVi.texts),
      googleSourceCharacters: googleVi.sourceCharacters,
    });
    persistPartialResults();

    currentOperation = 'llm-end-to-end';
    const llmEndToEnd = await doClient.complete(endToEndRequest, cases, 'end-to-end', raw =>
      store.writeJson('responses/llm-end-to-end.json', raw)
    );
    results.push({ arm: 'llm-end-to-end', outputs: llmEndToEnd.outputs, usage: llmEndToEnd.usage });
    persistPartialResults();

    currentOperation = 'restore-google';
    const restored = await doClient.complete(restoreRequest, cases, 'restore', raw =>
      store.writeJson('responses/llm-restore.json', raw)
    );
    const restoredTexts = restored.outputs.map(output => output.restoredVi!);
    const restoreGoogle = await googleClient.translate(restoredTexts, 'vi', raw =>
      store.writeJson('responses/restore-google.json', raw)
    );
    const combined = restored.outputs.map((output, index) => ({
      ...output,
      english: restoreGoogle.texts[index],
    }));
    results.push({
      arm: 'restore-google',
      outputs: combined,
      usage: restored.usage,
      googleSourceCharacters: restoreGoogle.sourceCharacters,
    });
    persistPartialResults();

    const blind = blindResults(cases, results);
    store.writeJson('results.json', {
      completedAt: new Date().toISOString(),
      partial: false,
      arms: results,
      mechanical: mechanicalRows(cases, results),
      observedCost: observedCost(results),
      blindMapping: blind.mapping,
      googleCharacters: armGoogleCharacters(
        googleAuto.sourceCharacters,
        googleVi.sourceCharacters,
        restoreGoogle.sourceCharacters
      ),
    });
    store.writeText('review.md', blind.review);
    updateReservation('complete', { completedAt: new Date().toISOString() });
  } catch (error) {
    const message = (error as Error).message
      .split(doKey)
      .join('[REDACTED]')
      .split(googleKey)
      .join('[REDACTED]');
    store.writeJson('results.json', {
      partial: true,
      updatedAt: new Date().toISOString(),
      arms: results,
      mechanical: mechanicalRows(cases, results),
      observedCost: observedCost(results),
      operationalFailure: { arm: currentOperation, message },
    });
    updateReservation('failed', { failure: message });
    throw new Error(message);
  }
}

async function resumeReviewed402(
  store: ArtifactStore,
  cases: DiacriticCase[],
  endToEndRequest: ReturnType<typeof buildDoRequest>,
  restoreRequest: ReturnType<typeof buildDoRequest>,
  manifest: ReturnType<typeof makeManifest>['manifest']
): Promise<void> {
  const reviewed = loadReviewed402Continuation(store, cases, manifest.fixture.sha256);
  dotenv.config();
  const doKey = process.env.DO_INFERENCE_API_KEY;
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!doKey || !googleKey) {
    throw new Error(
      'DO_INFERENCE_API_KEY and GOOGLE_TRANSLATE_API_KEY are required for the continuation'
    );
  }
  const updateReservation = (state: string, extra: Record<string, unknown> = {}) =>
    store.writeJson('reservation.json', {
      ...(store.read('reservation.json') as Record<string, unknown>),
      state,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
  updateReservation('resume-running', {
    resume: {
      authorizedAt: new Date().toISOString(),
      reason: 'manually-reviewed-http-402-before-inference',
      consumedBeforeResume: { digitalOcean: 0, google: 2 },
      remainingCalls: { digitalOcean: 2, google: 1 },
    },
  });

  const doClient = new DigitalOceanExperimentClient(createFetchTransport(doKey));
  const googleSdk = new Translate({ key: googleKey, autoRetry: false, maxRetries: 0 });
  const googleClient = new GoogleExperimentClient(googleSdk);
  const results = [...reviewed.results];
  let currentOperation = 'model-access';
  const persistPartialResults = () =>
    store.writeJson('results.json', {
      partial: true,
      updatedAt: new Date().toISOString(),
      arms: results,
      mechanical: mechanicalRows(cases, results),
      observedCost: observedCost(results),
      continuation: 'reviewed-http-402',
    });
  try {
    await doClient.assertModelAvailable();

    currentOperation = 'llm-end-to-end';
    const llmEndToEnd = await doClient.complete(endToEndRequest, cases, 'end-to-end', raw =>
      store.writeJson('responses/llm-end-to-end.json', raw)
    );
    results.push({ arm: 'llm-end-to-end', outputs: llmEndToEnd.outputs, usage: llmEndToEnd.usage });
    persistPartialResults();

    currentOperation = 'restore-google';
    const restored = await doClient.complete(restoreRequest, cases, 'restore', raw =>
      store.writeJson('responses/llm-restore.json', raw)
    );
    const restoredTexts = restored.outputs.map(output => output.restoredVi!);
    const restoreGoogle = await googleClient.translate(restoredTexts, 'vi', raw =>
      store.writeJson('responses/restore-google.json', raw)
    );
    results.push({
      arm: 'restore-google',
      outputs: restored.outputs.map((output, index) => ({
        ...output,
        english: restoreGoogle.texts[index],
      })),
      usage: restored.usage,
      googleSourceCharacters: restoreGoogle.sourceCharacters,
    });
    persistPartialResults();

    const blind = blindResults(cases, results);
    store.writeJson('results.json', {
      completedAt: new Date().toISOString(),
      partial: false,
      arms: results,
      mechanical: mechanicalRows(cases, results),
      observedCost: observedCost(results),
      blindMapping: blind.mapping,
      googleCharacters: results.reduce(
        (sum, result) => sum + (result.googleSourceCharacters ?? 0),
        0
      ),
      continuation: 'reviewed-http-402',
    });
    store.writeText('review.md', blind.review);
    updateReservation('complete', {
      completedAt: new Date().toISOString(),
      resumeCompletedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = (error as Error).message
      .split(doKey)
      .join('[REDACTED]')
      .split(googleKey)
      .join('[REDACTED]');
    store.writeJson('results.json', {
      partial: true,
      updatedAt: new Date().toISOString(),
      arms: results,
      mechanical: mechanicalRows(cases, results),
      observedCost: observedCost(results),
      operationalFailure: { arm: currentOperation, message },
      continuation: 'reviewed-http-402',
    });
    updateReservation('failed', { resumeFailure: message });
    throw new Error(message);
  }
}

export async function main(argv = process.argv.slice(2), rootDir = process.cwd()): Promise<void> {
  const options = parseCli(argv);
  const cases = loadFixture(rootDir);
  const { manifest, endToEnd, restore, reservation } = makeManifest(rootDir, cases);
  const store = new ArtifactStore(path.resolve(rootDir, ARTIFACT_DIR));
  store.prepare();
  store.writeJson('manifest.json', manifest);
  printPreflight(manifest, options.mode);
  if (options.mode === 'dry-run') return;
  if (options.mode === 'resume-reviewed-402') {
    await resumeReviewed402(store, cases, endToEnd, restore, manifest);
  } else {
    await executeLive(store, cases, endToEnd, restore, manifest, reservation);
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
