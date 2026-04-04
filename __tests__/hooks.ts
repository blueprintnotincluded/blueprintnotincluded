// Root hook: fail any test that calls console.warn or console.error
import { RootHookObject } from 'mocha';
export const mochaHooks: RootHookObject = {
  beforeAll() {
    const fail = (level: string) => (...args: unknown[]) => {
      throw new Error(`console.${level} called in tests: ${args.join(' ')}`);
    };
    console.warn  = fail('warn') as typeof console.warn;
    console.error = fail('error') as typeof console.error;
  }
};
