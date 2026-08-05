import fs from 'fs';
import path from 'path';
import { Translate } from '@google-cloud/translate/build/src/v2';
import dotenv from 'dotenv';
import { ArtifactStore, sha256 } from './diacritic-ab/artifacts';
import {
  assertGeminiRequestWithinCap,
  assertGoogleCharacters,
  fullReservation,
} from './diacritic-ab/caps';
import {
  createGeminiFetchTransport,
  GeminiExperimentClient,
  GoogleExperimentClient,
} from './diacritic-ab/clients';
import {
  ARTIFACT_DIR,
  CAPS,
  EXPERIMENT_REVISION,
  FIXTURE_PATH,
  GEMINI_ENDPOINT,
  GEMINI_MODEL,
  PROMPT_VERSIONS,
  RATES,
  V1_ARTIFACT_DIR,
} from './diacritic-ab/constants';
import { blindResults, mechanicalRows, observedCost } from './diacritic-ab/evaluation';
import { loadFixture } from './diacritic-ab/fixture';
import { buildGeminiRequest } from './diacritic-ab/prompts';
import { ArmOutput, ArmResult, DiacriticCase, ExperimentArm } from './diacritic-ab/types';

interface CliOptions {
  mode: 'dry-run' | 'execute';
}

export function parseCli(argv: string[], nodeEnv = process.env.NODE_ENV): CliOptions {
  const allowed = new Set(['--execute', '--ack-max-usd=0.02']);
  const unknown = argv.filter(arg => !allowed.has(arg));
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  const execute = argv.includes('--execute');
  const acknowledged = argv.includes('--ack-max-usd=0.02');
  if (!execute && acknowledged) {
    throw new Error('The acknowledgement is valid only with --execute');
  }
  if (execute && !acknowledged) {
    throw new Error('Live execution requires the exact acknowledgement --ack-max-usd=0.02');
  }
  if (execute && nodeEnv === 'test') {
    throw new Error('Live experiment execution is disabled when NODE_ENV=test');
  }
  return { mode: execute ? 'execute' : 'dry-run' };
}

function promptHash(request: ReturnType<typeof buildGeminiRequest>): string {
  return sha256(
    JSON.stringify({
      ...request,
      contents: [{ role: 'user', parts: [{ text: '<fixture-inputs>' }] }],
    })
  );
}

function cacheIdentity(
  arm: ExperimentArm,
  provider: string,
  promptVersion: string,
  fixtureHash: string
): string {
  return sha256(`${EXPERIMENT_REVISION}\n${arm}\n${provider}\n${promptVersion}\n${fixtureHash}`);
}

export function makeManifest(rootDir: string, cases: DiacriticCase[]) {
  const fixtureBytes = fs.readFileSync(path.resolve(rootDir, FIXTURE_PATH));
  const fixtureHash = sha256(fixtureBytes);
  const endToEnd = buildGeminiRequest(cases, 'end-to-end');
  const restore = buildGeminiRequest(cases, 'restore');
  const sourceCharacters = cases.reduce((sum, item) => sum + item.asciiInput.length, 0);
  const reservation = fullReservation();
  const manifest = {
    experiment: EXPERIMENT_REVISION,
    createdAt: new Date().toISOString(),
    v1Disposition: fs.existsSync(path.resolve(rootDir, V1_ARTIFACT_DIR))
      ? 'preserved-local-artifact-present'
      : 'local-artifact-absent-or-deleted',
    fixture: { path: FIXTURE_PATH, sha256: fixtureHash, cases: cases.length, sourceCharacters },
    prompts: {
      endToEnd: { version: PROMPT_VERSIONS.endToEnd, sha256: promptHash(endToEnd) },
      restore: { version: PROMPT_VERSIONS.restore, sha256: promptHash(restore) },
    },
    provider: {
      gemini: { endpoint: GEMINI_ENDPOINT, model: GEMINI_MODEL, api: 'generateContent-v1beta' },
      google: { api: 'cloud-translation-basic-v2' },
    },
    credentialNames: ['GEMINI_API_KEY', 'GOOGLE_TRANSLATE_API_KEY'],
    requestReservations: {
      geminiEndToEndInputTokens: assertGeminiRequestWithinCap(JSON.stringify(endToEnd)),
      geminiRestoreInputTokens: assertGeminiRequestWithinCap(JSON.stringify(restore)),
      geminiOutputTokensPerCall: CAPS.geminiOutputTokensPerCall,
      googleCharactersPerFixtureBatch: assertGoogleCharacters(
        cases.map(item => item.asciiInput),
        CAPS.sourceCharacters
      ),
    },
    calls: {
      geminiInference: CAPS.geminiCalls,
      geminiMetadataPreflight: 1,
      googleTranslation: CAPS.googleCalls,
      retries: CAPS.retries,
      concurrency: CAPS.concurrency,
    },
    rates: RATES,
    rateSources: {
      gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
      google: 'https://cloud.google.com/translate/pricing',
    },
    caps: CAPS,
    reservation,
    identities: {
      googleAuto: cacheIdentity('google-auto', 'google-basic-v2', 'batch-auto-v1', fixtureHash),
      googleVi: cacheIdentity('google-vi', 'google-basic-v2', 'batch-forced-vi-v1', fixtureHash),
      llmEndToEnd: cacheIdentity(
        'llm-end-to-end',
        GEMINI_MODEL,
        PROMPT_VERSIONS.endToEnd,
        fixtureHash
      ),
      restoreGoogle: cacheIdentity(
        'restore-google',
        `${GEMINI_MODEL}+google-basic-v2`,
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
      `Live execution acknowledged. Reserving exactly 2 Gemini inference calls, 3 Google translation calls, and $${manifest.reservation.maximumUsd.toFixed(7)} maximum calculated usage ($0.02 fail-closed ledger).`
    );
  } else {
    console.log(
      'Offline dry run complete. No credential was read, no live client was constructed, and no provider request was sent.'
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

function redactSecrets(value: unknown, secrets: string[]): unknown {
  const serialized = JSON.stringify(value);
  if (serialized == null) return value;
  return JSON.parse(
    secrets.reduce((result, secret) => result.split(secret).join('[REDACTED]'), serialized)
  ) as unknown;
}

async function executeLive(
  store: ArtifactStore,
  cases: DiacriticCase[],
  endToEndRequest: ReturnType<typeof buildGeminiRequest>,
  restoreRequest: ReturnType<typeof buildGeminiRequest>,
  manifest: ReturnType<typeof makeManifest>['manifest'],
  reservation: ReturnType<typeof fullReservation>
): Promise<void> {
  if (store.exists('reservation.json')) {
    console.log(JSON.stringify(store.read('reservation.json'), null, 2));
    if (store.exists('results.json'))
      console.log(JSON.stringify(store.read('results.json'), null, 2));
    throw new Error(
      'Reservation already exists; captured or partial results require manual review'
    );
  }

  dotenv.config();
  const geminiKey = process.env.GEMINI_API_KEY;
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!geminiKey || !googleKey) {
    throw new Error('GEMINI_API_KEY and GOOGLE_TRANSLATE_API_KEY are required for --execute');
  }
  const secrets = [geminiKey, googleKey];
  const capture = (name: string) => (raw: unknown) =>
    store.writeJson(`responses/${name}.json`, redactSecrets(raw, secrets));

  const now = new Date().toISOString();
  store.createReservation({
    experiment: EXPERIMENT_REVISION,
    state: 'reserved',
    reservedAt: now,
    updatedAt: now,
    calls: { gemini: reservation.geminiCalls, google: reservation.googleCalls },
    tokens: { input: reservation.geminiInputTokens, output: reservation.geminiOutputTokens },
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

  const geminiClient = new GeminiExperimentClient(createGeminiFetchTransport(geminiKey));
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
    await geminiClient.assertModelAvailable();

    currentOperation = 'google-auto';
    const googleAuto = await googleClient.translate(inputs, 'auto', capture('google-auto'));
    results.push({
      arm: 'google-auto',
      outputs: googleOutputs(cases, googleAuto.texts),
      googleSourceCharacters: googleAuto.sourceCharacters,
    });
    persistPartialResults();

    currentOperation = 'google-vi';
    const googleVi = await googleClient.translate(inputs, 'vi', capture('google-vi'));
    results.push({
      arm: 'google-vi',
      outputs: googleOutputs(cases, googleVi.texts),
      googleSourceCharacters: googleVi.sourceCharacters,
    });
    persistPartialResults();

    currentOperation = 'llm-end-to-end';
    const llmEndToEnd = await geminiClient.complete(
      endToEndRequest,
      cases,
      'end-to-end',
      capture('llm-end-to-end')
    );
    results.push({ arm: 'llm-end-to-end', outputs: llmEndToEnd.outputs, usage: llmEndToEnd.usage });
    persistPartialResults();

    currentOperation = 'restore-google';
    const restored = await geminiClient.complete(
      restoreRequest,
      cases,
      'restore',
      capture('llm-restore')
    );
    const restoreGoogle = await googleClient.translate(
      restored.outputs.map(output => output.restoredVi!),
      'vi',
      capture('restore-google')
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
    });
    store.writeText('review.md', blind.review);
    updateReservation('complete', { completedAt: new Date().toISOString() });
  } catch (error) {
    const message = secrets.reduce(
      (result, secret) => result.split(secret).join('[REDACTED]'),
      (error as Error).message
    );
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

export async function main(argv = process.argv.slice(2), rootDir = process.cwd()): Promise<void> {
  const options = parseCli(argv);
  const cases = loadFixture(rootDir);
  const { manifest, endToEnd, restore, reservation } = makeManifest(rootDir, cases);
  const store = new ArtifactStore(path.resolve(rootDir, ARTIFACT_DIR));
  store.prepare();
  store.writeJson('manifest.json', manifest);
  printPreflight(manifest, options.mode);
  if (options.mode === 'dry-run') return;
  await executeLive(store, cases, endToEnd, restore, manifest, reservation);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
