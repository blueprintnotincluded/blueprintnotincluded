// Root hook: fail any test that calls console.warn or console.error
import { RootHookObject } from 'mocha';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// hooks.ts is loaded via .mocharc's `require` entries, before any test file.
// Precedence, highest first: .env.test.local (gitignored, per-checkout) →
// the inherited environment → the committed .env.test. The local file has to
// *override* the environment: the devcontainer sets DB_URI on the app
// container to the dev database, and letting that win pointed the suite's
// cleanup at the dev data — bni-worktree-up writes .env.test.local precisely
// so tests hit `blueprintnotincluded_test` by service name. CI has no
// .env.test.local, so its DB_URI job var still beats .env.test.
dotenv.config({ path: path.resolve(__dirname, '../.env.test.local'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
process.env.NODE_ENV = 'test';

// Backstop for whatever the resolution above produced: the suite drops
// collections between tests, so it must never connect to anything but a
// database named for the purpose. Throw before ../app/app opens the
// connection below.
const testDbName = (process.env.DB_URI ?? '').replace(/\?.*$/, '').split('/').pop() ?? '';
if (!testDbName.endsWith('_test')) {
  throw new Error(
    `Refusing to run the test suite against database "${testDbName || '(none)'}" (DB_URI=${process.env.DB_URI}). ` +
      'The suite wipes collections between tests; point .env.test.local or DB_URI at a database whose name ends in _test.',
  );
}
// The suite's baseline is the default (workos) auth mode; specs that need
// local mode set AUTH_MODE themselves and restore it. The devcontainer sets
// AUTH_MODE=local on the container, so an inherited value has to be cleared
// here or every WorkOS-mode spec silently runs in local mode and 501s.
delete process.env.AUTH_MODE;

// Importing the app here (before any test file) starts the mongoose connection
// as early as possible and registers db.ts's `connected` listener, which is
// what calls every Model.init(). The waitForDbReady hook below then blocks
// the test run until that listener has actually run, instead of racing it.
import '../app/app';

const waitForDbReady = () => {
  if (mongoose.connection.readyState === 1) return;
  return new Promise<void>((resolve, reject) => {
    mongoose.connection.once('connected', () => resolve());
    mongoose.connection.once('error', reject);
  });
};

// A long-lived local test database keeps whatever indexes an older schema
// created, and Mongo refuses to redefine one in place — so a field newly added
// to the blueprintsearch text index is simply not indexed, and the failure
// surfaces as a search test that finds nothing rather than as an index error.
// CI never hits this (fresh mongo per run); a developer's machine always does.
// syncIndexes drops what the schema no longer declares and creates what it
// does, which is exactly the migration's effect on the test database.
// A failure here is reported, not swallowed: silence is exactly the failure
// mode this hook exists to prevent — an index that didn't sync shows up later
// as a query returning nothing, with no hint of the cause. Named per model so
// the message points at the schema to look at. console.error is unavailable
// (the hook above makes it throw), so this throws out of beforeAll.
const syncTestIndexes = async () => {
  const failures: string[] = [];
  for (const name of Object.keys(mongoose.models)) {
    try {
      await mongoose.models[name].syncIndexes();
    } catch (err) {
      failures.push(`${name}: ${(err as Error)?.message ?? String(err)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Failed to sync test indexes —\n  ${failures.join('\n  ')}`);
  }
};

export const mochaHooks: RootHookObject = {
  beforeAll: [
    function () {
      const fail = (level: string) => (...args: unknown[]) => {
        throw new Error(`console.${level} called in tests: ${args.join(' ')}`);
      };
      console.warn = fail('warn') as typeof console.warn;
      console.error = fail('error') as typeof console.error;
    },
    waitForDbReady,
    syncTestIndexes,
  ],
};
