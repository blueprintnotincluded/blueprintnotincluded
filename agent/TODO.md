# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: OniExtract2024 migration — Phases 1–6 complete (branch `export-aqua`), awaiting push
- **Date**: 2026-06-20
- **Stack**: Node 20.19.4 · TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 194 backend (Mocha + Chai) · 453 frontend (Vitest) — all green

## OniExtract2024 Migration Next Steps (branch `export-aqua`)

All 6 phases are committed. Remaining cleanup to do **after merge to master**:

### Retire legacy batch scripts (safe to delete)
- `app/api/batch/generate-icons.ts`
- `app/api/batch/generate-white.ts`
- `app/api/batch/generate-groups.ts`
- `app/api/batch/generate-repack.ts`
- `app/api/batch/enhanced-extract-export.ts`
- `app/api/batch/test-canvas.ts`
- Remove corresponding `npm run generate*` scripts from `package.json`

### Adapt remaining batch scripts
- `app/api/batch/add-info-icons.ts` — now redundant (converter emits overlay sprites); verify
  and retire or redirect to `database-2024.json`
- `app/api/batch/update-thumbnail.ts` — update to load `database-2024.json` instead of
  `database.json` when regenerating thumbnails
- `app/api/batch/asset-validator.ts` — loosen `validateDatabase()` to allow empty
  `spriteModifiers` array (currently rejects it)

### Clean up old atlas assets (after smoke-test in prod)
- `assets/database/database.json` (5.7MB), `database-groups.json`, `database-white.json`,
  `database-repack.json`, `database.zip` (362KB) — remove when legacy batch scripts are gone
- `assets/images/` atlas PNGs (`repack_*.png`) — remove after retiring generate-repack
- `frontend/src/assets/images/repack_*.png` — same
- `frontend/src/assets/database/database.json` (4.8MB), `database.zip` — remove

### Asset-processing tests update
Tests in `__tests__/asset-processing/` still validate the OLD database files. Once those files
are removed, update or replace those tests to validate `database-2024.json` shape instead
(empty `spriteModifiers`, uiSprites with 449+17 entries, buildings with `uiImage` field).

### Verify in-app rendering
Run the app (`./dev-setup.sh` + `npm run dev` + `cd frontend && npm start`), load a blueprint
with 2024 buildings, confirm flat icons render and overlays (element tiles, info indicators) work.

---

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
- **Frontend** — Coverage as of 2026-06-17: Statements 70.40%, Branches 91.57%, Functions 60.46% (453 specs)
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
