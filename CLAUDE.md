# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the source repository for blueprintnotincluded.org, a web application for creating and sharing blueprints for the game Oxygen Not Included. It's a full-stack TypeScript application with an Express.js backend and Angular frontend.

## Architecture

- **Backend**: Express.js with TypeScript (`app/` directory)
  - Main server entry: `app/server.ts`
  - API routes in `app/api/`
  - MongoDB with Mongoose for data persistence
  - JWT authentication for user sessions
  - Blueprint processing and image generation using Canvas and PIXI.js
  - Batch processing scripts for assets in `app/api/batch/`
  
- **Frontend**: Angular application (`frontend/` directory)
  - Blueprint visualization and editing interface
  - Multi-language support (English, Chinese, Russian, Korean)
  - Uses PrimeNG components

- **Shared Library**: TypeScript library (`lib/` directory)
  - Blueprint data structures and utilities
  - Drawing and rendering helpers
  - Shared between frontend and backend

## Development Commands

### Development (Recommended)
- `./dev-setup.sh` - Start dependencies (database + mail)
- `npm run dev` - Start backend with live reloading
- `cd frontend && npm start` - Start frontend with live reloading
- Frontend: http://localhost:4200, Backend: http://localhost:3000

### Production Testing
- `docker compose up` - Start with pre-built images
- Visit: http://localhost:3000

### Backend Development
- `npm run dev` - Start development server with auto-reload
- `npm run tsc` - Compile TypeScript
- `npm run build` - Full build (backend + frontend + lib)
- `npm run serve:prod` - Run production build

### Testing
- `npm run test` - Run tests with database setup
- `npm run test:only` - Run tests without database setup
- `npm run test:db-setup` - Setup test database only

### Frontend Development (from frontend/ directory)
- `npm start` - Start Angular development server
- `npm run build` - Build for production
- `npm run lint` - Run Angular linting
- `npm test` - Run frontend tests (required before committing frontend changes)
- `npm run test:coverage` - Run tests with V8 coverage report

### Asset Processing
**OniExtract2024 import (current pipeline):** after dropping a fresh export into
`export/` (`export/database/`, `export/ui_image/`, `export/connection_sprites/`),
run the single repeatable step:
- `npm run import:2024` - Regenerate `database-2024.json` into both asset roots
  (`assets/database/` + `frontend/src/assets/database/`), content-aware sync `ui_image/`
  and `connection_sprites/` into both roots, flatten `po_string.json` into the frontend's
  English game-string map (`frontend/src/assets/strings/strings.json` — the display names
  the build menu resolves element/building/category ids against), and print a validation
  report. Exits non-zero if the import is incomplete (missing icons, incomplete connection
  dirs, `po_string.json` absent, etc.).
- `npm run import:2024:dry-run` - Validate + report counts only; writes/copies nothing.
- The committed runtime DB artifact is the loose `database-2024.json` (readable diffs).
  The `database-2024.zip` (both roots) is a **gitignored** build derivative: the backend
  reads the JSON directly, the frontend regenerates the zip from it via `prebuild`/
  `prestart` (`frontend/scripts/build-database-zip.js`). The converter emits no `.zip`.
- Sprite sync rewrites a file only when it actually changed and prunes removed ones, so
  unchanged icons keep their mtime and git shows only real changes. The export is NOT
  byte-deterministic across game updates (Klei re-rasterizes untouched art), so a PNG
  that differs in bytes is additionally checked *perceptually* (`pngVisuallyEqual`:
  alpha-premultiply → small Gaussian blur → count pixels still differing) and preserved
  when the pixels are visually identical. The blur is what distinguishes real redraws from
  sub-pixel re-rasterization jitter even on densely-textured sprites. Re-importing the same
  export is a near no-op.
- `ui_image_facade/` is intentionally skipped (unused by the app); one-line flip in
  `app/api/batch/convert-export-2024.ts` to enable.
- After import: restart `npm run dev` (backend reads `database-2024.json` at startup) and
  restart the frontend (`cd frontend && npm start`) so its `prestart` regenerates the zip.
  No lib rebuild needed for data/icon-only iterations.
- `convert:2024` is a kept alias for `import:2024`.

Export contract + converter behaviour: `app/api/batch/convert-export-2024.md`.

The legacy 2020/2023 atlas pipeline has been removed — the `generate-icons/white/groups/repack`,
`enhanced-extract-export`, `extract-export`, `test-canvas`, and `add-info-icons` batch scripts
and their `npm run generate*` / `seed` / `enhancedSeed` / `testCanvas` entries no longer exist.
Remaining batch utilities:
- `npm run fixHtmlLabels` - Fix HTML formatting in labels.
- `npm run derive-metadata` - Backfill `requiredDlcs`, `mods`, `modded` and `category` on all blueprint documents from stored building IDs. Use `--dry-run` flag (`npm run derive-metadata:dry-run`) to preview counts without writing. Both modes report the prefab ids found in blueprints but missing from `database-2024.json` — those ids drive `modded=true` **and** contribute no `dlcIds`, so each one is a blueprint silently reading as base game. Add `--recategorize` (`npm run derive-metadata -- --recategorize`) to re-derive `category` for documents that already have one, overwriting user picks; needed whenever the scoring rules in `blueprint-analyzer` change, since the default only fills in nulls.
- `npm run avatars:smoke` / `avatars:seed-batch -- --count N` / `avatars:backfill[:dry-run]` - Gemini avatar pipeline (costs real money per generation; setup + rollout order in `agent/AVATARS.md`).
- `npm run backfill-previews` - Render preview images for all non-deleted blueprints (newest first) and store them durably in Mongo (`previewimages` collection). Skips blueprints whose durable rows are already fresh, so it's rerunnable/resumable. Use `--dry-run` (`npm run backfill-previews:dry-run`) to report the fresh/stale split without rendering or writing.
- **Running batch tasks in production:** the deploy image has no devDependencies or TS sources, but ships `package.json` + `scripts/batch.sh` into `/bpni/build`, so the same npm task names work there: `cd /bpni/build && npm run avatars:seed-batch -- --count 10` (likewise `derive-metadata`, `backfill-previews`, `migrate:up`, …). `batch.sh` dispatches to compiled `app/api/batch/<name>.js` in the image and `ts-node` in a dev checkout. Direct `node app/api/batch/<name>.js` also works. New prod-runnable batch tasks must go through `scripts/batch.sh`, and any files they read at runtime must land in `build/` (copy_assets.sh + a `COPY` in deploy.Dockerfile). Full checklist: README "Running batch tasks in production".

### Docker
- `docker-compose up` - Full development environment with database
- `docker build . -t bpni:latest` - Build production image

## GitHub & CI

The `gh` CLI is available and authenticated. Use it for all GitHub operations rather than constructing URLs manually.

```bash
# CI / workflow inspection
gh run list --limit 10                   # Recent workflow runs
gh run view <run-id>                     # Run details and logs
gh run view <run-id> --log-failed        # Only failed step logs

# PRs and issues
gh pr list                               # Open PRs
gh pr view <number>                      # PR details
gh pr checks <number>                    # CI status for a PR
gh issue list                            # Open issues

# Repo settings (useful for security/CI audits)
gh api repos/blueprintnotincluded/blueprintnotincluded/actions/permissions
gh api repos/blueprintnotincluded/blueprintnotincluded/actions/permissions/workflow
```

The GitHub repo is at https://github.com/blueprintnotincluded/blueprintnotincluded.

### CI Workflows
- `backend-test.yml` — runs on push/PR to master touching backend paths
- `frontend-test.yml` — runs on push/PR to master touching frontend paths  
- `publish.yml` — deploys to DigitalOcean on push to master only

## Environment Configuration

Copy `.env.sample` to `.env` and configure:
- `DB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `ENV_NAME` - Environment identifier (`production` enables Mailjet; otherwise nodemailer/SMTP)
- `SMTP_HOST`/`SMTP_PORT` - Mail server for dev/test (defaults to localhost:1025)
- `MAILJET_API_KEY`/`MAILJET_SECRET_KEY`/`MAILJET_FROM_EMAIL` - Required in production for email
- `SITE_URL` - Base URL included in password reset links

## Database

Uses MongoDB 8.0.23 locally and in CI (prod upgrade from 7.0.34 pending) with Mongoose models in `app/api/models/`:
- `blueprint.ts` - Blueprint documents
- `user.ts` - User accounts

## Key Libraries and Technologies

- **Canvas**: Server-side image generation
- **PIXI.js**: Sprite rendering and manipulation
- **Mongoose**: MongoDB ODM
- **Express-JWT**: Token-based authentication
- **Jimp**: Image processing
- **node-mailjet**: Email service (switched from SendGrid)

## Testing

**Backend**: Mocha with Chai and TypeScript support. Test files in `__tests__/` directory. The test database setup script creates a clean test environment.
- **Framework**: Mocha with Chai — do not introduce Jest
- **Maintenance**: When removing large dependency sets, regenerate package-lock.json with `rm package-lock.json && npm install` to prevent corruption
- **Email in tests**: `emailService.ts` skips SMTP when `NODE_ENV=test` — no mail server needed

**Frontend**: Vitest with jsdom (no real browser). Runner: `@angular/build:unit-test`. Coverage via `@vitest/coverage-v8`.
- All specs in `frontend/src/**/*.spec.ts`; run with `npm test` from `frontend/`
- Run a single spec via the `--include` glob: `npm test -- --include='**/login-page.component.spec.ts'`. Do NOT run `vitest`/`ng test` against a bare file path — globals and the Angular TestBed are wired by the builder setup file, so plain `vitest run <file>` fails with `describe is not defined`
- `npm run test:coverage` generates a text summary + lcov report
- CI runs `test:coverage` so every PR shows a coverage table in the job log
- Renderer (`DrawPixi`, PIXI) is always mocked in unit tests — never instantiate real PIXI in specs

## Current Status

- **Phase**: OniExtract2024 flat-icon rendering (current asset pipeline)
- **Date**: 2026-07-12
- **Node.js**: 20.19.4 (via volta)
- **Stack**: TypeScript 5.9.3 strict (both trees) · Mongoose 8.24 · Express 5.2 · Canvas 3.2.3 · Angular 20 · PrimeNG 20 · ESLint 9 flat config · Prettier 3 (both trees) · husky 9 + lint-staged 16
- **Tests**: ✅ Backend 530 passing (Mocha 11 + Chai 4; 2 workos-provision specs flake locally, green in CI) · Frontend 981 passing (Vitest/jsdom)
- **Build**: ✅ `npm run tsc` clean · `npm run build` clean
- **Lint**: `cd frontend && npm run lint` (ESLint 9 flat config, `frontend/eslint.config.js`); backend has no ESLint yet — Prettier only

### Asset rendering: OniExtract2024 flat icons
Rendering uses the 2024 flat-icon model, not the retired multi-sprite atlas. Contract and
converter details: `app/api/batch/convert-export-2024.md`.
- **Types**: `lib/src/b-export/b-export-2024.ts` — raw 2024 export shapes (13 files).
- **Import**: `app/api/batch/convert-export-2024.ts` (`npm run import:2024`) → consolidated
  `database-2024.json` written to both asset roots (committed; the `.zip` is a gitignored
  build derivative); content-aware syncs `ui_image/` (1,241 flat PNGs) and
  `connection_sprites/` into both asset roots.
- **Render**: each building is one flat icon — `OniItem.flatIconId`, `DrawPart.flatIconId`,
  no UV slice. `uiImageRect` (when present) places overhanging art relative to the
  footprint; otherwise the icon is stretched to the footprint.
- **Connectables** (31 prefabs): render `connection_sprites/{prefabId}/{bitmask}.png` per
  4-bit neighbour mask (left=1, right=2, up=4, down=8). `OniItem.connectionSprites` is
  derived from dir presence; `BlueprintItem` builds 16 tagged flat-icon draw-parts;
  per-building `connectionScale` is measured from `15.png` at import time. The build/select
  menu keeps the single canonical icon (`iconUrl`).
- **Utility ports** (275/449 buildings): `BBuildingDef2024.utilities[]` carries each
  input/output port as `{offset, type, isSecondary}`. The U59 export emits `type` as the
  `ConnectionType` enum *name* (string); the converter maps it to the int via
  `CONNECTION_TYPE_BY_NAME`. Offsets are pre-rotation/y-up/footprint-relative and already
  match the website's internal convention (no transform). `BlueprintItem.drawPixiUtility`
  draws the markers per overlay; the 8 indicator sprites (`input`/`output`/`logicInput`…)
  are registered from the export's own `ui_image/<name>.png` flats (copied into
  `frontend/src/assets/images/` at import) — they no longer slice the legacy atlas pages.
  Details: `app/api/batch/convert-export-2024.md`.
- **Loaders**: backend reads `database-2024.json` directly; frontend fetches
  `database-2024.zip` (regenerated from the committed JSON by its `prebuild`/`prestart`).
- **DLC data**: each building record now includes `dlcIds: string[]` (e.g. `['EXPANSION1_ID']`
  for Spaced Out buildings). The converter (`import:2024`) populates this from the raw export's
  `kPrefabID.requiredDlcIds`. Used by `BlueprintAnalyzer` to derive metadata.

### Keyboard shortcuts
Editor input goes through an action layer, never raw key comparisons.
- **`frontend/src/app/module-blueprint/keybindings/shortcut-actions.ts`** — the catalogue of
  rebindable actions (id, category, label, default chords). Defaults mirror Oxygen Not
  Included's own controls where the game has an equivalent action; website-only actions take
  keys the game leaves free. Adding a shortcut = one entry here + one handler registration.
- **`keybindings/key-chord.ts`** — chord model over `KeyboardEvent.code` (physical key, like
  the game), with pure parse/serialize/format helpers. Serialized modifier order is fixed
  (`Ctrl+Alt+Shift+Meta+Code`); a spec fails on any default written out of order.
- **`services/keybinding.service.ts`** — resolves chord → action, detects conflicts, and
  persists **only the user's diff from the defaults** (`localStorage['bpni-keybindings-v1']`)
  so future default changes still reach existing users.
- **`services/keyboard-shortcut.service.ts`** — dispatcher. Components call
  `register(actionId, handler)` and never see a key. Handlers are LIFO (a transient owner
  shadows the editor-wide one) and returning `false` declines an action that doesn't apply
  right now. Text inputs are guarded centrally here.
- **Tools** implement `handleShortcut(action): boolean`, not `keyDown(keyCode)`.
- **UI**: `components/dialogs/dialog-keybindings/` — Edit ▸ Keyboard shortcuts, or `Shift+/`.

### Blueprint metadata auto-derivation
`requiredDlcs`, `gameVersion` and `modded` are derived deterministically from the blueprint
content — users no longer set these manually. `multiplayerSafe` has been removed entirely.

- **`lib/src/blueprint/blueprint-analyzer.ts`** — pure functions (TDD-covered):
  - `deriveRequiredDlcs(buildingDlcIds: string[][]): string[]` — the union of every placed
    building's raw Klei DLC ids, deduped and sorted; `[]` = base game only. This is the
    current model; `deriveGameVersion` below is retained only until the frontend stops
    importing it (step 4 of `spec/dlc-requirements-plan.md`).
  - `deriveGameVersion(buildingDlcIds: string[][]): GameVersion` — **superseded.** Collapses
    the set to the highest-priority DLC found, so it can't express "needs Frosty *and*
    Bionic", and its `DLC5_ID`→bionicBooster mapping is wrong (DLC5 is the Aquatic pack).
  - `deriveModded(prefabIds: string[], knownIds: Set<string>): boolean` — true if any ID is absent
    from the loaded database
- **`lib/src/blueprint/dlc.ts`** — `DLC_LABELS`/`dlcLabel(id)`, the one place raw ids become
  display names (game strings `STRINGS.UI.<id>.NAME`); unknown ids fall back to the raw id.
  Stored data is always raw ids, never labels. A contract test fails if the export ships a
  DLC id with no label.
- **`Blueprint.requiredDlcs`** — server-derived on every save, fork and version restore
  (`app/api/services/dlc-derivation-service.ts`), never client-supplied; returned in the
  list/details/editor-open responses. Absent on documents predating the field until the
  backfill runs.
- **`Blueprint.hadUnknownBuildings`** — set during `importFromBni`/`importFromMdb` when a building
  ID is not found; read by the save dialog to detect mods stripped during import.
- **`?dlc=` filter** — `GET /api/getblueprints?dlc=DLC2_ID,DLC3_ID` returns blueprints requiring
  ANY of those packs (`$in`, like `rooms`; repeatable or comma-separated). Ids are validated by
  shape (`DLC_ID_PATTERN` / `MAX_DLC_FILTER_IDS` in `lib/src/blueprint/dlc.ts`, max 20), never
  against `DLC_LABELS` — a pack that ships in an export before we've written its label must
  still be filterable. Docs with no `requiredDlcs` never match.
- **`?excludeDlc=` filter** — the complement: `requiredDlcs: { $nin: [...] }`, same shape
  validation, composes with `dlc=`/`category=`. This replaced the plan's `owned=` subset idea —
  "I don't want Bionic blueprints" is more useful and more expressive than declaring what you
  own. Base-game (`[]`) and never-derived docs both survive exclusion (conservative: absence of
  DLC info is never treated as needing the excluded pack). A `$nin` on `requiredDlcs` gets no
  help from the field's indexes (can't produce a bounded range, so the planner keeps the
  `createdAt`-sorted index and applies the exclusion as a per-doc FETCH filter) — checked with
  `explain()`, not a collscan, just no extra narrowing.
- **DLC exclusion preference** — `dlcPreferences.excludedDlcs` on `User` (raw ids, `default:
  []`), read/written via `GET`/`PATCH /api/users/me/dlc-preferences`. Applied automatically on
  Discover load for a logged-in user *only* when the URL has no explicit `excludeDlc` param;
  written back only on real interaction (toggle/clear), never merely from loading it, never for
  a logged-out visitor. Private account data — never in `ProfileResponse` or any other
  user-facing payload.
- **Display** — the blueprint card and details page render one linked chip per required DLC
  (`dlcLabel()`, `dlcTooltip()` in `utils/chip-tooltip.ts`); `[]` renders "Base game", while an
  absent set renders nothing. The Discover sidebar has two DLC facet groups — "show only" and
  "hide" — each multi-select and round-tripping through its own URL param (`dlc` / `excludeDlc`);
  a pack can't be in both, selecting it in one clears it from the other. Exclusion chips use the
  danger accent (`exclude: true` on `ActiveFilterChip`) so the two read as opposite intents.
- **Save dialog** — the DLC requirement set and `modded` are read-only, derived from blueprint
  content on open (`gameVersion` is still derived and submitted, but no longer displayed).
  `researchTier` is hidden (no tech-tree data in current export; field kept in schema for future use).
- **Backfill** — `npm run derive-metadata` re-derives `gameVersion`, `requiredDlcs`, `mods`
  and `modded` for all existing blueprints. **The `?dlc=` filter matches nothing until this
  runs** — no document written before the field existed has a set at all (prod: `cd /bpni/build
  && npm run derive-metadata`, dry-run first).

### Session Management Files
Check these files in `agent/` directory for current status:
- `agent/TODO.md` - Improvement roadmap and remaining work
- `agent/SESSION_NOTES.md` - Session-by-session progress
- `agent/WORKOS_PLAN.md` - WorkOS auth operational reference (env mapping, admin roles)
- `agent/AVATARS.md` - Gemini avatar generation operational reference (API key setup, pool, costs)
- `UPGRADE_PLAN.md` - Upgrade history and strategy

### Quick Status Check Commands
```bash
# Environment verification
node --version        # Should be 20.19.4
npm run test         # Should pass 204 backend tests
npm run tsc          # Should compile without errors

# GitHub CI status
gh run list --limit 5
head -20 agent/TODO.md
```

### All Upgrade Phases Complete
1. ✅ **Phase 1A**: Node.js 20.18.0 → 20.19.4 (volta + .nvmrc)
2. ✅ **Phase 1B**: lib TypeScript 3.5.3 → 5.9.2, ES2020 target
3. ✅ **Phase 2A**: Backend TypeScript 4.9.5 → 5.9.2, strict mode
4. ✅ **Phase 2B**: Mongoose 5.7.7 → 8.18.1 (incremental)
5. ✅ **Phase 3**: Express 4.x → 5.1.0
6. ✅ **Phase 4**: Canvas 2.6.1 → 3.2.3
7. ✅ **Phase 5**: Angular 13 → 20, PrimeNG 19 → 20
8. ✅ **CI**: All GitHub Actions improvements applied

### Key Constraints
- Canvas 3.x requires Node 20 — do not upgrade to Node 22
- All test infrastructure is Mocha + Chai — do not introduce Jest
- Rate limiting is handled by Cloudflare — do not add express-rate-limit

## Database Migrations

Uses **migrate-mongo** — Rails-style versioned migrations tracked in the `migrations` collection.
Migration files live in `migrations/` as plain CommonJS `.js` files (no compilation needed).

### Commands
```bash
npm run migrate:status          # show applied / pending migrations
npm run migrate:up              # run all pending migrations
npm run migrate:down            # roll back the last applied migration
npm run migrate:create -- <name>  # scaffold a new migration file
```

### Authoring a migration
Scaffold with `npm run migrate:create -- <name>`, then fill in `up` and `down`:

```js
'use strict';
module.exports = {
  async up(db) {
    // db is the native MongoDB driver Db object
  },
  async down(db) {
    // must fully reverse up — used for rollback
  },
};
```

Rules:
- Both `up` and `down` must be idempotent (safe to re-run if interrupted).
- Never `$unset` the old field in the same operation that reads it as a filter.
- Set new fields first, verify counts, clean up old fields in a separate migration.
- Leave orphaned old fields in place; they disappear naturally once removed from the Mongoose schema.

### Credential rules
- Admin URI (`doadmin`) — DO app console env only. Never on local machine.
- `doctl` — installed; use it freely for reads (app logs, specs, deployments). The API
  token is normally **read-only**; writes (`doctl apps update` etc.) fail by design. For
  rare write tasks Kevin temporarily swaps in a full-access token and removes it after —
  if a write fails on permissions, ask, don't work around it.
- Read-only URI — `/.env.migration` (gitignored). Safe to store; cannot write to DB.
- `/.env` — local dev only. Never put prod or staging credentials here.
- `/prod-dump/` — gitignored. Real prod data; never commit.

### Pre-merge process for every migration
```bash
# 1. Tests pass
npm run test

# 2. Check status and run against local DB
npm run migrate:status
npm run migrate:up

# 3. Dump prod using read-only credentials
source .env.migration
mongodump --uri="$PROD_READONLY_URI" --out=./prod-dump

# 4. Restore prod dump locally under a separate DB name
mongorestore --uri="mongodb://localhost:27017" --db="bpni-prod" --drop ./prod-dump/blueprintnotincluded

# 5. Run against real prod data — this is where you catch actual problems
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:status
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:up
# Inspect results before proceeding
```

### Post-deploy execution (DO app console)
```bash
# DO dashboard → prod cluster → Backups → Create backup now  (wait for completion)
npm run migrate:status   # confirm which migrations are pending
npm run migrate:up
```

**First deploy with migrate-mongo:** prod has no `migrations` tracking collection yet.
`migrate:up` will run all migrations from the beginning. The ported Migration 1
(`20260403000000_blueprint-deleted-to-deletedAt`) is idempotent — it filters on
`{ deletedAt: { $exists: false } }` so it safely no-ops on already-migrated documents.

### Rollback
`npm run migrate:down` rolls back the last migration via its `down` method.
For a full restore: DO dashboard → Backups → restore the pre-deploy snapshot to a new cluster → update `DB_URI` env var in App Platform.

---

## Work Session Lifecycle

Every work session has a defined start and end. AI code review and CI run on pull
requests, so a session that ends with only local commits is a dead session — the work
sits invisible until someone comes back and pushes it. Do not stop at "committed".

**Session start:**
1. `git fetch origin master`
2. Create a new branch based on `origin/master` (master is push-protected; never work on it)

**During the session — committing:**

Commit autonomously at every logical break point — do NOT pause to ask permission.
A logical break point is: a feature complete, a refactor complete, tests passing, a migration applied, or any other self-contained unit of work.

Commit message format:
- Subject: conventional commits style (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), ≤72 chars
- Body (when the why is non-obvious): explain motivation and any constraints a future reader would need; skip if the subject is self-explanatory
- Always append a `Co-Authored-By` trailer with the current model name, e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

Stage only relevant files — never `git add -A` blindly. Do not skip hooks (`--no-verify`).

**Session end — push and open a PR (autonomously, without asking):**
1. Update any committed docs that describe shipped state (e.g. `spec/ROADMAP.md`, `agent/TODO.md`) so they reflect what this branch ships
2. `git push -u origin <branch>`
3. `gh pr create` with a real description: what shipped, design decisions and spec deviations, how it was verified (test counts, migrations run), and anything deferred
4. Report the PR URL as the session's final output

## Important Instructions
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.