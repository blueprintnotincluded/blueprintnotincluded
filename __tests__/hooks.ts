// Root hook: fail any test that calls console.warn or console.error
import { RootHookObject } from 'mocha';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// hooks.ts is loaded via .mocharc's `require` entries, before any test file,
// so DB_URI isn't set yet locally (CI sets it directly as a job env var, but
// dotenv won't override that either way — it skips already-set keys).
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
process.env.NODE_ENV = 'test';

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
const syncTestIndexes = async () => {
  for (const name of Object.keys(mongoose.models)) {
    await mongoose.models[name].syncIndexes().catch(() => undefined);
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
