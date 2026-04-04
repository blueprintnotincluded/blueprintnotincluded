# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Phase 7 - Zero-Warning Enforcement (backend ✅, frontend ⏳)
- **Date**: 2026-04-03
- **Stack**: Node 20.19.4 · TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 3.2.3 · Angular 20.3.18 · PrimeNG 20.4.0
- **Tests**: 141 passing (Mocha + Chai — do not switch to Jest)

---

## Phase 7: Zero-Warning Enforcement

### ✅ DONE — Backend enforcement
- `tsconfig.json` + `lib/tsconfig.json`: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` enabled
- `frontend/.eslintrc.json`: `no-console` rule added
- `.mocharc.json`: `forbid-only: true`
- `__tests__/hooks.ts`: Mocha root hook fails on `console.warn`/`console.error`
- `package.json`: `concurrently`, `typecheck`, `dev:full` scripts
- `.github/workflows/backend-test.yml`: explicit `npm run tsc` step

### ⏳ PENDING — Frontend strict enforcement

The strict flags (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `strictTemplates`) were prematurely added to
`frontend/tsconfig.base.json` and **reverted** because the frontend has ~50 files with
pre-existing violations. They must be fixed file-by-file before the flags can be re-enabled.

See `agent/SESSION_NOTES.md` for the full list of known violations and fix approach.

### ℹ️ Bundle budgets

The bundle budget in `frontend/angular.json` was also part of Phase 7 enforcement. The actual
production bundle is **3.25 MB**. Current budget: `3.5mb warn / 4mb error` (a meaningful
constraint vs the original 5mb/10mb, and actually achievable). To tighten further requires
real bundle-size reduction work (tree-shaking pixi.js, lazy-loading PrimeNG modules, etc.).

Goal: every automated system (build, lint, test, dev server, CI, git hooks) treats warnings as
errors and fails loudly. Work in two stages: (1) add enforcement mechanisms, (2) fix all existing
noise that those mechanisms surface.

### Step 1 — Audit existing noise (run first, capture output)

Before adding any enforcement, run each system and record every warning/error that currently
exists. This becomes the fix list for Step 3.

| System | Command | What to capture |
|--------|---------|-----------------|
| Backend tsc | `npm run tsc` | All TS diagnostics |
| Lib tsc | `tsc -b lib` | All TS diagnostics |
| Backend tests | `npm run test` | Any `console.warn`/`console.error` output, deprecation notices |
| Frontend lint | `cd frontend && npm run lint` | All ESLint warnings |
| Frontend build | `cd frontend && npm run build` | Budget warnings, template warnings |
| Frontend dev | `cd frontend && ng serve --no-live-reload` | Console output at startup |

### Step 2 — Add enforcement mechanisms

Each item below adds a gate. After adding all gates, Step 3 clears all the failures they surface.

#### 2a. TypeScript: enable unused-variable and control-flow flags

**Files**: `tsconfig.json` and `lib/tsconfig.json`
**Change**: Uncomment and enable these four flags (currently present but commented out):
```json
"noUnusedLocals": true,
"noUnusedParameters": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true
```
**Effect**: `npm run tsc` and `npm run build:lib` fail on dead code and incomplete return paths.

#### 2b. TypeScript: add strict flags to Angular frontend

**File**: `frontend/tsconfig.base.json`
**Change**: Add to `compilerOptions`:
```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true
```
**Also**: Add to `angularCompilerOptions`:
```json
"strictTemplates": true
```
(`strictInjectionParameters` is already present; `strictTemplates` additionally type-checks all
component templates — binding types, missing inputs, pipe return types.)

**Effect**: `ng build` and `ng lint` fail on template type errors and dead code.

#### 2c. ESLint: ban console statements in source code

**File**: `frontend/.eslintrc.json`
**Change**: In the `*.ts` files override, add to `rules`:
```json
"no-console": ["error", { "allow": ["warn", "error"] }]
```
**Effect**: `npm run lint` fails if `console.log` or `console.info` appear in frontend source.
`console.warn` and `console.error` remain allowed for legitimate runtime diagnostics.

**Note**: For the backend there is no ESLint setup today. A backend `.eslintrc.json` could be
added as a separate step; for now the frontend lint gate is the higher-value target.

#### 2d. Mocha: fail on `console.error`/`console.warn` and ban `.only`

Two changes to `__tests__` infrastructure:

**i. Add `--forbid-only` to `.mocharc.json`**
```json
"forbid-only": true
```
Prevents `it.only`/`describe.only` from accidentally being committed (they silently skip all
other tests).

**ii. Add a Mocha root hooks file** `__tests__/hooks.ts`
```typescript
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
```
Register it in `.mocharc.json`:
```json
"require": ["ts-node/register", "__tests__/hooks.ts"]
```

**Effect**: Any test (or code under test) that calls `console.error`/`console.warn` fails
immediately with a descriptive error. Forces legitimate warnings to be either suppressed
intentionally (spy in a specific test) or fixed at the source.

**Important**: Mongoose deprecation notices and driver warnings arrive via `console.warn` — these
will become test failures and must be resolved (see Step 3).

#### 2e. Backend dev server: parallel type-checking

**Current problem**: `ts-node-dev --transpile-only` skips all type checking. TypeScript errors
are invisible during local development.

**Change**: Add two new scripts to `package.json`:
```json
"typecheck": "tsc --noEmit --watch",
"dev:full": "concurrently --names 'server,types' 'npm run dev' 'npm run typecheck'"
```
Add `concurrently` as a dev dependency.

**Effect**: `npm run dev:full` runs the hot-reload server and a parallel type watcher side by
side. Type errors appear in the terminal as they are introduced. `npm run dev` (transpile-only)
remains available for speed when type-checking is not needed.

**Note**: `concurrently` is a very small dev-only dependency. Alternatively this can be achieved
with two terminal tabs running `npm run dev` and `npm run typecheck` separately — the scripts
are useful either way.

#### 2f. Angular build: tighten bundle size budgets

**File**: `frontend/angular.json`
**Current thresholds**: initial bundle warning 5 MB / error 10 MB; component styles warning 6 kB / error 10 kB
**Proposed thresholds**: Set warning to something near the current actual size (discovered in
Step 1 audit), then set error ~20% above that. This turns future regressions into build failures.

The exact numbers depend on the audit result. A reasonable starting point:
- Initial bundle: warning 2 MB / error 3 MB
- Component styles: warning 4 kB / error 8 kB

Adjust after running `ng build --stats-json` and inspecting `stats.json`.

**Effect**: Bundle size growth beyond baseline becomes a CI-blocking error rather than silent.

#### 2g. CI: add explicit TypeScript type-check step to backend workflow

**File**: `.github/workflows/backend-test.yml`
**Current problem**: `npm run test` uses `TS_NODE_TRANSPILE_ONLY=true` — no type checking in CI.
**Change**: Add a step before tests:
```yaml
- name: Type-check backend
  run: npm run tsc
```
**Effect**: TypeScript errors in CI are caught as a blocking step, not silently skipped.

#### 2h. CI: add tsc step to frontend workflow

**File**: `.github/workflows/frontend-test.yml`
**Current**: `ng lint` + `ng test` + `ng build` — the build already type-checks, so this is lower
priority. However, `ng build` is the last step; adding `npm run tsc` (for lib) or a frontend-only
`tsc --noEmit` before lint would surface errors earlier in the pipeline.

#### 2i. Git pre-commit: extend to cover backend TypeScript

**File**: `frontend/.husky/pre-commit`
**Current**: Runs `lint-staged` in the frontend directory only. Backend TS changes are not checked.
**Change**: Add backend `tsc --noEmit` when `app/` or `lib/` files are staged:
```sh
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Frontend: lint staged files
cd frontend && volta run --node 20.19.4 npx lint-staged

# Backend: type-check if any backend/lib TS files are staged
cd ..
if git diff --cached --name-only | grep -qE '^(app|lib)/.*\.ts$'; then
  volta run --node 20.19.4 npm run tsc
fi
```
**Effect**: Backend type errors are caught before commit, not just in CI.

### Step 3 — Fix all existing noise

After Step 2, run each system and fix every failure that surfaces. Categories of expected findings:

- **Unused variables/parameters** (TypeScript `noUnusedLocals`/`noUnusedParameters`) — prefix with `_` or delete
- **Missing return paths** (`noImplicitReturns`) — add explicit returns
- **Template type errors** (Angular `strictTemplates`) — fix binding types in component HTML
- **`console.log` in frontend source** (ESLint `no-console`) — remove debug logs
- **`console.warn`/`console.error` in test output** (Mocha hooks) — suppress intentionally or fix
- **Bundle size** — investigate and reduce if over new budget thresholds
- **Any TypeScript errors surfaced by CI tsc step** — fix at source

### Step 4 — Verify all gates are green

Run the full suite and confirm zero warnings, zero errors in each system:

```bash
npm run tsc                          # backend + lib
npm run test                         # mocha (no console output)
cd frontend && npm run lint          # ESLint (no warnings)
cd frontend && npm run build         # ng build (no budget warnings)
cd frontend && npm run ci:karma      # karma (no console output)
```

All CI workflows should also pass on the resulting branch.

---

## Future Security Improvements

Deferred — no active sprint. Revisit when product direction is clearer.

- **Account Lockout** — track failed attempts in user model; lock 15 min after 5 failures
- **Email Verification** — require email confirmation for new registrations
- **Password Strength** — enforce complexity; consider `zxcvbn`
- **JWT Hardening** — add expiration, refresh mechanism, and logout blacklisting
- **HTTPS Enforcement** — HTTPS redirect middleware + HSTS header in production
- **Input Sanitization** — strengthen beyond current username regex; XSS protection for user content
- **Security Logging** — structured log for auth events (failed logins, registrations, password changes)
- **Login Anomaly Detection** — alert on multi-IP patterns, unusual frequency

---

## Future Test Coverage

- **Asset Processing** — generateIcons, generateGroups pipeline tests
- **Frontend** — 48 Angular tests exist (version service, dialogs, pipes); more component units,
  service tests, and blueprint viewer integration tests needed

---

## Future Technical Debt

- **API Documentation** — no OpenAPI/Swagger spec exists

---

## CI Notes
All improvements complete — see `agent/CI_IMPROVEMENTS.md`.
MongoDB health check uses legacy `mongo` CLI (fine for current `mongo:4.2` image); upgrade health
check to `mongosh` when upgrading the MongoDB image.
