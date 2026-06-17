# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Phase 7 - Zero-Warning Enforcement ✅ COMPLETE
- **Date**: 2026-04-04
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

### ✅ DONE — Frontend strict enforcement

All flags are enabled in `frontend/tsconfig.base.json` and the build is clean:
`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `strictTemplates`. Zero errors in tsc, ng build, and ng lint.

### ℹ️ Bundle budgets

Production bundle is **3.25 MB**. Current budget: `3.5mb warn / 4mb error`. To tighten further
requires real bundle-size reduction work (tree-shaking pixi.js, lazy-loading PrimeNG modules).

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
- **Frontend** — `npm run test:coverage` shows the gaps. Priority areas by coverage delta:
  - **Auth components** (~35–51%): `login-page`, `register-page`, `forgot-password`,
    `reset-password`, `magic-request/callback`, `verify-email-callback` — form components
    with submittable state; straightforward to test with mocked `AuthService`
  - **Services** (~42–52%): `blueprint-service`, `authentification-service`, `tool-service`,
    `feedback-service` — logic-heavy; add unit tests with mocked `HttpClient`
  - **Tool logic** (~16–44%): `build-tool`, `select-tool`, `element-report`,
    `same-item-collection` — pure logic that is testable without a renderer
  - **Directives** (~31–55%): `draganddrop`, `mousewheel`, `custom-event-manager`,
    `username-validation` — event-based; testable with synthetic DOM events
  - **Drawing** (`draw-pixi`, `draw-mini-ui`): low coverage is expected and acceptable —
    these require a full PIXI mock; defer until the mock patterns are established

---

## Future Technical Debt

- **API Documentation** — no OpenAPI/Swagger spec exists

---

## CI Notes
All improvements complete — see `agent/CI_IMPROVEMENTS.md`.
MongoDB health check uses legacy `mongo` CLI (fine for current `mongo:4.2` image); upgrade health
check to `mongosh` when upgrading the MongoDB image.
