# Session Notes - 2026-04-03

## What We Accomplished ✅

### Test Coverage Expansion (108 → 141 tests)

1. **User Auth Coverage** (auth.test.ts)
   - Registration validation: duplicate username/email, special chars, length > 30
   - Full password reset flow: request token (valid + nonexistent email), use token
     (invalid, expired, success with login verification, token reuse prevention)
   - Patched `emailService.ts` to skip SMTP when `NODE_ENV=test`

2. **Blueprint API Coverage** (blueprints.test.ts)
   - `GET /api/getblueprint/:id` — valid id, likedByMe flag, nonexistent id, bad id format
   - `GET /api/getblueprints` — filterUserId, filterName, case-insensitive name search
   - `POST /api/uploadblueprint` — 401 without auth, new blueprint, overwrite prompt,
     overwrite=true, name validation (special chars, length > 60)
   - `POST /api/likeblueprint` — 401 without auth, like, unlike, nonexistent id, missing id
   - `POST /api/deleteblueprint` — 401 without auth, soft delete, ownership enforcement, missing id

### Database Indexes Added

- **Blueprint**: `{ createdAt: -1 }`, `{ owner, createdAt }`, `{ owner, name }`
- **User**: `{ resetToken }`

### API Error Standardization

All error responses now use JSON:API format via shared `apiError()` helper
(`app/api/utils/apiError.ts`):
```json
{ "errors": [{ "status": "400", "title": "Human-readable message" }] }
```

HTTP status codes corrected across all controllers:
- Validation errors: `500` → `400`
- Not found: `500` → `404`
- Permission denied: `500` → `403`
- Only genuine server faults remain `500`

Success responses are unchanged (frontend reads them directly).

### Phase 7 Partial: Backend Zero-Warning Enforcement ✅

The following backend enforcement was completed and is working:
- `tsconfig.json`: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` enabled
- `lib/tsconfig.json`: same flags enabled
- `frontend/.eslintrc.json`: `no-console` rule added (bans `console.log`, allows `console.warn`/`console.error`)
- `.mocharc.json`: `forbid-only: true` added
- `__tests__/hooks.ts`: Mocha root hook that fails tests on `console.warn`/`console.error`
- `package.json`: `concurrently` + `typecheck`/`dev:full` scripts added
- `.github/workflows/backend-test.yml`: explicit `npm run tsc` type-check step added

---

## Phase 7 Breakage & Fix (this session) ⚠️

Commit `164ff819` broke CI on the `noise` branch PR by prematurely applying
frontend enforcement that the frontend codebase wasn't ready for.

### What broke

1. **`frontend/tsconfig.base.json`**: Added `strict`, `noUnusedLocals`, `noUnusedParameters`,
   `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `strictTemplates` — surfaced
   **hundreds of violations across ~50 frontend files** that were never addressed.

2. **`frontend/angular.json`**: Bundle budget tightened to `2mb warn / 3mb error` but the
   actual production bundle is **3.25 MB** (pixi.js-legacy + PrimeNG + Sentry).

### What was fixed to restore CI green

- **Reverted `frontend/tsconfig.base.json`** back to pre-enforcement state (no strict flags,
  no strictTemplates). The frontend is **not yet clean enough** for these flags.
- **Restored bundle budgets** to `3.5mb warn / 4mb error` (realistic given current bundle size;
  tighter than the original 5mb/10mb but achievable now).
- **Fixed individual TS errors** in files that were newly added/modified on this branch:
  - `game-string-service.ts` — `PO_FILES` type, unused `rej`, `dict!` definite assignment
  - `tool-service.ts` — `!` on 5 uninit fields, `ToolRequest`, `IObsToolChanged` void return
  - `blueprint-service.ts` — HTTP generics, `yaml.load()`, `undefined` guard, `!` fields, void return
  - `check-duplicate-service.ts` — missing `return null`
  - `version.service.ts` / `.spec.ts` — unused imports
  - `authentification-service.ts` — remove `Router`, fix token null coerce, HTTP generics
  - `request-reset.component.ts` — unused `response`/`error` params
  - `package.json` — added missing `@types/js-yaml` dev dependency

---

## Phase 7 Remaining Work: Frontend Strict Enforcement

**The frontend half of Phase 7 still needs to be done properly.**
Before re-enabling the strict flags in `frontend/tsconfig.base.json`, all violations
must be fixed first. Estimated scope: **~50 files**.

### Approach (do in order)

1. **Fix all `noUnusedLocals` / `noUnusedParameters` violations** (~30 files)
   - Remove unused imports, prefix unused params with `_`
   - Many pipes have `...args: any[]` — remove or prefix

2. **Fix all `TS2564` property initialization violations** (~20 files)
   - Add `!` (definite assignment) or provide a real initializer
   - Common pattern: class properties set in `ngOnInit` or `@ViewChild` — use `!`

3. **Fix all `noImplicitReturns` violations** (~5 files)
   - Add explicit `return` or `return undefined` to functions missing a return path

4. **Fix all `TS2322` null-assignability violations** (~10 instances)
   - Use `| null` in type declarations or use `!` non-null assertions

5. **Fix `strict` mode violations** (implicit any, strictNullChecks, etc.)
   - Mostly in older drawing/tools code

6. **Fix `strictTemplates` violations** (template type-checking)
   - Angular template bindings need to match component input types exactly

7. **Re-enable flags in `frontend/tsconfig.base.json`** — add them back once all violations pass

### Key files with known violations (from CI output)

- `src/app/module-blueprint/common/tools/build-tool.ts` — many null checks, unused params
- `src/app/module-blueprint/common/tools/select-tool.ts`
- `src/app/module-blueprint/drawing/draw-pixi.ts` — many uninit properties
- `src/app/module-blueprint/drawing/draw-mini-ui.ts`
- `src/app/module-blueprint/components/component-blueprint-parent/component-blueprint-parent.component.ts`
- `src/app/module-blueprint/components/component-canvas/component-canvas.component.ts`
- `src/app/module-blueprint/module-blueprint.module.ts` — unused imports
- `src/app/module-blueprint/pipes/` — all 4 pipe files (unused `args`)
- `src/oni-item.ts`
- `src/coms/blueprint-list-response.ts`

---

## Decisions Made This Session

- **Error format**: JSON:API (`{ errors: [{ status, title }] }`) — RFC 7807 deemed overkill
- **Rate limiting**: Deferred to Cloudflare — no express-rate-limit needed
- **Security items** (account lockout, email verification, JWT hardening): not prioritized
- **Frontend strict enforcement**: deferred until all ~50 violations are individually fixed first

## Remaining Work (other)

- **Database Validation** — strengthen Mongoose schema validation / input sanitization
- **Asset Processing tests** — batch script pipelines
- **API Documentation** — no OpenAPI/Swagger spec
- **Security** — account lockout, email verification, JWT hardening, HTTPS/HSTS,
  input sanitization, security logging (rate limiting handled by Cloudflare)
