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

The toolchain lives in `.devcontainer/` — Node, the native build deps for
`canvas` and `sharp`, MongoDB and Mailpit. Everything below runs **inside the
app container**; the host needs only a container runtime.

- `docker compose --env-file .env -f .devcontainer/docker-compose.yml up -d` - Bring up the whole stack. `--env-file` is required: compose looks for `.env` beside the compose file, not at the repo root
- `... exec app bash` - A shell in the container, where every command below runs. `app` runs no servers, so nothing you do in it disturbs one
- `npm ci && (cd frontend && npm ci) && npm run build:lib && npm run migrate:up` - First run only. The migration is part of it: the schema the code expects is not the schema a fresh database has. The `api` and `web` services poll for the result and start serving on their own; do **not** run `npm run dev` or `npm start` by hand
- `... logs -f api web` / `... restart api` - Watch or bounce a server
- Frontend: http://localhost:4200, Backend: http://localhost:3000
- From inside, the database is `database:27017` and mail is `mailhog:1025` — service names, not localhost
- The dev container runs in local auth mode: open the login page and pick a dev user, or log in
  with the form using any `@bpni.local` email — the password is `dev_password`

To run on the host instead (Node 20.19.4 per `.nvmrc`): `./dev-setup.sh` starts
just the database and mail, and `DB_URI` / `SMTP_HOST` are already `localhost`
in `.env.sample`. The *test* database is separate: the suite reads
`.env.test.local` before the committed `.env.test`, so a checkout on a
non-default `MONGO_PORT` — or one that ran in the container first, leaving a
`.env.test.local` pointing at `database:27017` — needs that file rewritten. It takes the port as a *number*: dotenv does no
variable expansion (16.6.1), so a `${MONGO_PORT}` written there is stored and
used literally, and `scripts/test-db-setup.sh` would then probe the
placeholder. From a shell that has the value —
`echo "DB_URI=mongodb://localhost:$MONGO_PORT/blueprintnotincluded_test" > .env.test.local`.

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
  that differs in bytes is additionally checked _perceptually_ (`pngVisuallyEqual`:
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

Export contract, converter behaviour, and the flat-icon/connectable/utility-port rendering
model: `app/api/batch/convert-export-2024.md`.

The legacy 2020/2023 atlas pipeline has been removed — the `generate-icons/white/groups/repack`,
`enhanced-extract-export`, `extract-export`, `test-canvas`, and `add-info-icons` batch scripts
and their `npm run generate*` / `seed` / `enhancedSeed` / `testCanvas` entries no longer exist.
Remaining batch utilities:

- `npm run fixHtmlLabels` - Fix HTML formatting in labels.
- `npm run derive-metadata` - Backfill `requiredDlcs`, `mods`, `modded` and `category` on all blueprint documents from stored building IDs. Use `--dry-run` flag (`npm run derive-metadata:dry-run`) to preview counts without writing. Both modes report the prefab ids found in blueprints but missing from `database-2024.json` — those ids drive `modded=true` **and** contribute no `dlcIds`, so each one is a blueprint silently reading as base game. `modded` is written in both directions (a false positive can be cleared), except that `hadUnknownBuildings: true` always wins — those blueprints had unknown buildings stripped at import, so re-derivation can't rediscover them. Note `Element` is an editor annotation synthesized by `OniItem.load`, not a database building; it must be added to any `knownIds` set built from `database-2024.json` or every annotated blueprint reads as modded. The retired `Info` id belongs in that set too — it no longer registers an `OniItem`, but pre-migration documents can still carry it. Add `--recategorize` (`npm run derive-metadata -- --recategorize`) to re-derive `category` for documents that already have one, overwriting user picks; needed whenever the scoring rules in `blueprint-analyzer` change, since the default only fills in nulls.
- `npm run derive-rooms` / `derive-rooms:dry-run` - Re-derive the `rooms` field on all non-deleted blueprints with the same detector the save path uses.
- `npm run derive-search` / `derive-search:dry-run` - Rebuild the `blueprintsearch` rows, then run two translation passes over the titles: confidently non-English ones through Google, and (unless `--skip-provider-detect`) conservative undetectable ASCII candidates through Gemini's romanized-Vietnamese gate first. Only explicit `not-vietnamese` results continue to Google's general provider detection; ambiguous/invalid results remain authored. Gemini batches are at most 12 titles / 720 characters, concurrency 1, zero retries. Dry-run constructs no Gemini client and reports exact title/document/character/batch/token/micro-USD ceilings. Rerunnable — fresh rows only get their ranking signals refreshed, already-translated rows are left alone, and accepted translations are cache reads. **Run `npm run migrate:up` first** whenever the text or translation-unit index has changed.
- **`--limit N` on both derive tasks** - A full pass loads every stored blueprint blob (~10 min on the live corpus), so diagnostic dry runs take `--limit N` (`npm run derive-metadata -- --dry-run --limit 100`). The capped run samples **randomly**, not the first N: natural order tracks insertion date and so does everything these reports measure, so a head sample would report the oldest blueprints' problems as the corpus average. Percentages from a sampled run extrapolate; the absolute counts don't. Shared helper: `app/api/batch/batch-sampling.ts`.
- `npm run avatars:smoke` / `avatars:seed-batch -- --count N` / `avatars:backfill[:dry-run]` - Gemini avatar pipeline (costs real money per generation; setup + rollout order in `agent/AVATARS.md`).
- `npm run backfill-previews` - Render preview images for all non-deleted blueprints (newest first) and store them durably in Mongo (`previewimages` collection). Skips blueprints whose durable rows are already fresh, so it's rerunnable/resumable. Use `--dry-run` (`npm run backfill-previews:dry-run`) to report the fresh/stale split without rendering or writing.
- **Running batch tasks in production:** the deploy image has no devDependencies or TS sources, but ships `package.json` + `scripts/batch.sh` into `/bpni/build`, so the same npm task names work there: `cd /bpni/build && npm run avatars:seed-batch -- --count 10` (likewise `derive-metadata`, `backfill-previews`, `migrate:up`, …). `batch.sh` dispatches to compiled `app/api/batch/<name>.js` in the image and `ts-node` in a dev checkout. Direct `node app/api/batch/<name>.js` also works. New prod-runnable batch tasks must go through `scripts/batch.sh`, and any files they read at runtime must land in `build/` (copy_assets.sh + a `COPY` in deploy.Dockerfile). Full checklist: README "Running batch tasks in production".

### Docker

- `docker-compose up` - Full development environment with database
- `docker build . -t bpni:latest` - Build production image

## GitHub & CI

The `gh` CLI is available and authenticated (repo:
https://github.com/blueprintnotincluded/blueprintnotincluded). `gh` command examples and the
CI workflow list: `docs/migrations.md`.

## Environment Configuration

Copy `.env.sample` to `.env` and configure:

- `DB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `AUTH_MODE` - `workos` (default) or `local`. Local mode seeds two dev users (`dev_you` admin,
  `dev_creator_alpha`) at boot and lets `/api/auth/login` authenticate them directly with no WorkOS keys — the
  devcontainer sets this on the container itself (`.devcontainer/docker-compose.yml`). Refused
  outright when `ENV_NAME=production`. Details: `specs/local-auth-mode-plan.md`.
- `ENV_NAME` - Environment identifier (`production` enables Mailjet; otherwise nodemailer/SMTP)
- `SMTP_HOST`/`SMTP_PORT` - Mail server for dev/test (`mailhog:1025` in the dev container, `localhost:1025` on the host)
- `MAILJET_API_KEY`/`MAILJET_SECRET_KEY`/`MAILJET_FROM_EMAIL` - Required in production for email
- `SITE_URL` - Base URL included in password reset links
- `PORT` - Backend listen port (default 3000). Links never derive from it — they use `HOST` / `SITE_URL` — so several checkouts can listen on different ports behind one hostname each
- `WEB_PORT` / `API_PORT` / `MONGO_PORT` / `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` / `COMPOSE_PROJECT_NAME` - Read by `docker compose` from `.env` to publish the container's ports on other **host** ports and keep one checkout's containers and volumes apart from another's. Inside the container the ports never move (4200 and 3000), so `PORT` and `BACKEND_PORT` matter only for a host-side run. `MONGO_TAG` picks the database image (default `8.0.23`; `8.2` on Linux kernels ≥ 6.19, where 8.0.x will not start — SERVER-121912). Details in README "Several checkouts side by side"

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
- **Test database location**: `__tests__/hooks.ts` resolves `DB_URI` as gitignored `.env.test.local` first (it *overrides* the environment — the app container carries the dev `DB_URI`, and an inherited value once pointed the suite's cleanup at the dev database), then the environment (CI sets it as a job var and has no local file), then the committed `.env.test`. The hooks then refuse to start unless the database name ends in `_test`. `scripts/test-db-setup.sh` resolves `DB_URI` the same way, so it checks and starts the Mongo the tests will actually use

**Frontend**: Vitest with jsdom (no real browser). Runner: `@angular/build:unit-test`. Coverage via `@vitest/coverage-v8`.

- All specs in `frontend/src/**/*.spec.ts`; run with `npm test` from `frontend/`
- Run a single spec via the `--include` glob: `npm test -- --include='**/login-page.component.spec.ts'`. Do NOT run `vitest`/`ng test` against a bare file path — globals and the Angular TestBed are wired by the builder setup file, so plain `vitest run <file>` fails with `describe is not defined`
- `npm run test:coverage` generates a text summary + lcov report
- CI runs `test:coverage` so every PR shows a coverage table in the job log
- Renderer (`DrawPixi`, PIXI) is always mocked in unit tests — never instantiate real PIXI in specs

## Current Status

Node.js 20.19.4 (via volta). See `agent/SESSION_NOTES.md` for the latest dated status
snapshot (stack versions, test counts, prod activation state) and `agent/TODO.md` for the
roadmap — both go stale fast, so this file doesn't duplicate them.

## Subsystem design notes

Deep design rationale lives next to the code it describes and loads automatically when
Claude Code reads files in that directory:

- `lib/src/blueprint/CLAUDE.md` — terrain annotations, world notes, Unicode blueprint
  names, DLC/metadata auto-derivation, building settings (buildingData)
- `app/api/services/CLAUDE.md` — search (blueprintsearch) & translation, content locale
- `app/api/batch/convert-export-2024.md` — OniExtract2024 asset pipeline + rendering model
- `frontend/src/app/module-blueprint/keybindings/CLAUDE.md` — keyboard shortcut architecture
- `docs/migrations.md` — `gh` CLI reference, migrate-mongo commands, credential rules,
  pre-merge and post-deploy process

### Session Management Files

Check these files in `agent/` directory for current status:

- `agent/TODO.md` - Improvement roadmap and remaining work
- `agent/SESSION_NOTES.md` - Session-by-session progress
- `agent/WORKOS_PLAN.md` - WorkOS auth operational reference (env mapping, admin roles)
- `agent/AVATARS.md` - Gemini avatar generation operational reference (API key setup, pool, costs)

### Quick Status Check Commands

```bash
# Environment verification
node --version        # Should be 20.19.4
npm run test         # Full backend suite (sets up the test DB first)
                     # Use test:only to skip DB setup - but a stale test DB
                     # makes API specs 404, so re-run `npm run test` before
                     # believing a failure there.
npm run tsc          # Should compile without errors

# GitHub CI status
gh run list --limit 5
head -20 agent/TODO.md
```

### Key Constraints

- Canvas 3.x requires Node 20 — do not upgrade to Node 22
- All test infrastructure is Mocha + Chai — do not introduce Jest
- Rate limiting is handled by Cloudflare — do not add express-rate-limit

## Database Migrations

Uses **migrate-mongo** — Rails-style versioned migrations tracked in the `migrations`
collection, files in `migrations/` as plain CommonJS `.js` (no compilation needed). Commands,
migration authoring rules, the pre-merge/post-deploy process and rollback: `docs/migrations.md`.

### Credential rules

- Admin URI (`doadmin`) — DO app console env only. Never on local machine.
- `doctl` — installed; use it freely for reads (app logs, specs, deployments). The API
  token is normally **read-only**; writes (`doctl apps update` etc.) fail by design. For
  rare write tasks Kevin temporarily swaps in a full-access token and removes it after —
  if a write fails on permissions, ask, don't work around it.
- Read-only URI — `/.env.migration` (gitignored). Safe to store; cannot write to DB.
- `/.env` — local dev only. Never put prod or staging credentials here.
- `/prod-dump/` — gitignored. Real prod data; never commit.

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

**Session end — push and open a _draft_ PR (autonomously, without asking):**

1. Update any committed docs that describe shipped state (e.g. `agent/TODO.md`) so they reflect what this branch ships
2. `git push -u origin <branch>`
3. `gh pr create --draft` with a real description: what shipped, design decisions and spec deviations, how it was verified (test counts, migrations run), and anything deferred — leading with what has **not** been verified yet
4. Report the PR URL and the outstanding verification as the session's final output

**The PR stays in draft until the feature is done, and done means manually tested by the
user.** Passing tests are not done — they show the code does what its author intended, not
that the feature works. Never take a PR out of draft; the user publishes it.

## Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
