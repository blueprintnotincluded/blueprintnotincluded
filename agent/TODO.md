# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Social evolution — metadata loop complete; next: Migration 2 / forks / profiles
- **Date**: 2026-06-24
- **Branch**: `discover-home`
- **Stack**: Node 20.19.4 · TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 204 backend (Mocha + Chai) · 474 frontend (Vitest) — all green

## OniExtract2024 follow-ups

Open items only (the import pipeline, render cutover, and legacy-pipeline removal are done;
see `app/api/batch/convert-export-2024.md` for the current contract).

- **Rename `import:2024`** to a version-neutral name — "2024" leaked everywhere from the
  milestone. Keep an alias for one cycle.
- **`uiImageRect` rollout (export side):** 342/449 buildings carry it; the remaining ~107
  fall back to stretch-to-footprint. Emit it for the deviating buildings.
- **`ui_image_facade/` (988 files):** unused — drop from the export handoff, or wire it up.
- **Unread export JSONs (10 of 13):** `entities`, `items`, `food`, `geyser`, `recipe`,
  `multiEntities`, `tags`, `attribute`, `po_string`, `db` — future capabilities
  (critters/recipes/i18n/etc.), nothing wired yet. `po_string` is the likely next one
  (i18n; site has zh/ru/ko but the export ships English only).

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

- **Asset Processing** — `__tests__/asset-processing/*` validate the `database-2024.json`
  shape + synced sprite assets; extend as the import pipeline grows
- **Frontend** — 474 specs as of 2026-06-24 (last measured coverage: Statements 70.40%, Branches 91.57%, Functions 60.46%)
  - ✅ **Auth components**: `login-page`, `register-page`, `forgot-password`, `reset-password`,
    `magic-request`, `magic-callback`, `verify-email-callback` — all spec'd with mocked `AuthService`
  - ✅ **Services**: `authentification-service`, `tool-service`, `feedback-service` — spec'd
  - ✅ **Tool logic**: `element-report`, `same-item-collection` — spec'd
  - ✅ **Directives**: `draganddrop`, `mousewheel`, `username-validation` — spec'd
  - ✅ **Tool logic**: `build-tool.ts` — 48 tests; connectAToB bitmask, drag step logic, updateBuildCandidateResult, observer pattern
  - ✅ **Services**: `blueprint-service.ts` — 57 tests; undo/redo stack, observer pattern, hashMdb, newBlueprint, handleGetBlueprint, HTTP methods (getBlueprint, getBlueprints, saveBlueprint, deleteBlueprint, likeBlueprint, openBlueprintFromId), private loaders (loadJsonBlueprint, loadYamlBlueprint), openBlueprintFromUpload
  - ✅ **Tool logic**: `select-tool.ts` — extended to 62 tests; all prior + reset, selectAllLike (non-element + element), selectEveryElement, addToCollection element grouping, stub no-ops (mouseOut/mouseDown/hover), dragStop null guard, keyDown 'b' with selected item
  - **High-value deferred** (remaining uncovered code):
    - `component-canvas.component.ts` — 555 missed lines (80% uncovered); main draw pipeline, drags PIXI
    - `component-blueprint-parent.component.ts` — 316 missed lines (56% uncovered)
    - `blueprint-service.ts` — 221 missed lines; complex undo stack
    - `select-tool.ts` — 180 missed lines; complex state machine
    - `draw-pixi.ts` / `draw-mini-ui.ts` — 147/102 missed, 0 functions hit; defer — requires full PIXI mock
  - **Remaining directives**: `custom-event-manager` — defer

---

## Future Technical Debt

- **API Documentation** — no OpenAPI/Swagger spec exists

---

## CI Notes
All improvements complete — see `agent/CI_IMPROVEMENTS.md`.
MongoDB health check uses legacy `mongo` CLI (fine for current `mongo:4.2` image); upgrade health
check to `mongosh` when upgrading the MongoDB image.
