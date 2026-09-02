# Blueprintnotincluded

This is the source repo of blueprintnotincluded.org

It is a combined curated version of the original blueprintnotincluded web app.

## Development Setup

### Development (Recommended)

The whole toolchain — Node, the native build deps for `canvas` and `sharp`,
MongoDB, Mailpit — is in `.devcontainer/`, so a checkout needs nothing on the
host but a container runtime. Open the folder in a devcontainer-aware editor
and it builds itself, or drive it by hand:

```bash
# One-time setup: copy environment configuration
cp .env.sample .env

# Bring the stack up. --env-file is not optional: compose looks for .env
# beside the compose file, not at the repo root.
dc() { docker compose --env-file .env -f .devcontainer/docker-compose.yml "$@"; }
dc up -d

# First run only: install and build, from inside the app container
dc exec app bash -lc 'npm ci && (cd frontend && npm ci) && npm run build:lib && npm run migrate:up'
```

That is the whole setup. `api` and `web` are services, not something you start
by hand — they poll for `node_modules` and `lib/index.js` and begin serving the
moment the install above finishes, live-reloading from the bind-mounted source
after that. `dc logs -f api web` to watch them, `dc restart api` to bounce one.

- **Frontend**: http://localhost:4200 (Angular dev server with API proxy)
- **Backend API**: http://localhost:3000 (Express with ts-node-dev)
- **Database**: mongodb://localhost:27017 (`database:27017` from inside)
- **Mail testing**: http://localhost:8025 (Mailpit web UI)

`dc exec app bash` is the shell for everything else — tests, migrations, batch
scripts, `git`, `gh`. The `app` container runs no servers, so nothing you do in
there disturbs one.

To run the app straight on the host instead — Node 20.19.4 per `.nvmrc` —
`./dev-setup.sh` starts just the database and mail from the production compose
file, and `DB_URI` / `SMTP_HOST` in `.env` become `localhost` rather than the
`database` / `mailhog` service names the sample ships.

### Several checkouts side by side

Every port is a knob, so two checkouts can run at once on one machine without
touching each other's database or mail. Only the *host* side moves: inside the
container the backend is always on 3000 and Angular always on 4200, so nothing
in there has to know which checkout it is.

Per checkout, in `.env`: `WEB_PORT` (the Angular dev server — the one you open),
`API_PORT`, `MONGO_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`, and
`COMPOSE_PROJECT_NAME` so the containers and volumes stay apart. `.env.sample`
has the block, commented out; the defaults above are what you get when it stays
that way.

Tests read a gitignored `.env.test.local` before `.env.test`, which is how the
suite is pointed at the container's Mongo (`mongodb://database:27017/
blueprintnotincluded_test`) rather than the committed `127.0.0.1` default.

Two knobs are about the host rather than the checkout: `MONGO_TAG`, because no
MongoDB 8.0 image starts on Linux kernels 6.19 and newer (SERVER-121912) — set
it to `8.2` on such a host — and `PORT` / `BACKEND_PORT`, which matter only if
you are running the app outside the container on a machine where 3000 is taken.

### Production Testing

Test with pre-built images (may require AMD64 emulation on ARM64 Macs):

```bash
docker compose up
```

Visit http://localhost:3000
To check incoming emails visit: http://localhost:8025

## Running batch tasks in production (DigitalOcean console)

The deploy image (`deploy.Dockerfile`) ships only compiled output under `/bpni/build`:
compiled JS, `assets/`, `package.json`, `migrations/`, and `scripts/batch.sh`. There are
**no TypeScript sources and no devDependencies** (`npm ci --omit=dev`), so anything that
needs `ts-node` cannot run there.

Run npm tasks by name from the build directory — same task names as local dev:

```bash
cd /bpni/build
npm run migrate:status
npm run migrate:up
npm run derive-search:dry-run
npm run avatars:smoke
npm run avatars:seed-batch -- --count 10
npm run derive-metadata:dry-run
npm run backfill-previews
```

Batch tasks dispatch through `scripts/batch.sh`, which runs the compiled
`app/api/batch/<name>.js` when it exists (deploy image) and falls back to `ts-node` on the
`.ts` source (dev checkout). Direct invocation also works as a fallback:
`node app/api/batch/<name>.js [args]` (no `--` separator needed).

`derive-search:dry-run` performs the romanized-Vietnamese candidate census
without constructing a Gemini client or reading `GEMINI_API_KEY`. It reports
unique titles, affected documents, source characters, planned batches, token
ceilings, and the maximum micro-USD reservation. Gemini batches are fixed at
no more than 12 titles / 720 source characters, concurrency 1, and zero retries.

For the Vietnamese-title rollout, deploy with
`GEMINI_VI_TITLE_TRANSLATION_ENABLED=false` and
`GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD=0`, then:

1. Run `npm run migrate:up` **before the new code serves traffic**. The
   translation cache now filters on `mode`, so against un-migrated rows a
   lookup misses and the write then collides with the old three-field unique
   index — a duplicate-key error on ordinary translation, not just on the
   Vietnamese path. Migration order is
   `20260804000000_search-title-original.js` followed by
   `20260805000000_translation-unit-modes.js`. Both are additive and reversible
   with `npm run migrate:down`; neither drops a field or rewrites text.
2. Run `npm run derive-search:dry-run` and review its exact census and maximum
   reservation before choosing a positive monthly allowance.
3. Set `GEMINI_VI_TITLE_TRANSLATION_ENABLED=true` and
   `GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD` to the reviewed value, restart the
   API, then run `npm run derive-search` once. Do not run the old Google-only
   provider detection backfill before this code is deployed.

   The API logs `[vi-title] ENABLED (monthly cap N micro-USD)` at startup when
   all three conditions are met, and `[vi-title] DISABLED (...)` otherwise —
   check that line before running the backfill.

**Staging and production share one database.** Two consequences worth knowing
before running any migration:

- migrate-mongo's `migrations` tracking collection is shared too, so whichever
  environment runs `migrate:up` first applies it for both. The second one
  reports nothing pending — that is correct, not a skipped step.
- There is therefore no safe rehearsal on staging. Migrating staging has
  already migrated production. Rehearse locally against a prod restore instead
  (see "Pre-merge process for every migration" in CLAUDE.md).

Because every migration is effectively run twice against the same data, each
must be idempotent, and must match indexes by **key pattern rather than by
name**. Mongoose's `autoIndex` races migrations on deploy: whichever creates an
index first wins, and if the two disagree about its name the loser fails with
`Index already exists with a different name`. Either pin the same explicit
name in both the schema and the migration, or match on the key pattern — the
Vietnamese-title migration does both.

If `derive-search` hits a Gemini **401/403** (bad, revoked, or unauthorized
key) or **429** (rate limit / quota exhausted), the pass stops immediately
rather than trying the remaining batches, and logs
`Gemini pass STOPPED ... needs action, not a retry` with the count of
unprocessed titles. This matters because budget is reserved *before* each
call: continuing would spend the whole monthly allowance on failures. Fix the
cause and re-run — accepted translations are cached and translated rows are
skipped, so a re-run resumes rather than redoing. An exhausted allowance stops
the pass the same way. Ordinary one-off errors (a 500, a malformed response)
still skip just that batch.

Rollback sets `GEMINI_VI_TITLE_TRANSLATION_ENABLED=false` and
`GEMINI_VI_TITLE_MONTHLY_BUDGET_MICRO_USD=0`, then restarts the API. This stops new Gemini calls while accepted cache rows remain usable;
authored `Blueprint.name` values are never changed. If quality problems require
removal, delete only translation units with mode `vi-romanized-title-v1` and
rebuild the disposable search rows from authored blueprints.

**Shipping new batch/asset code — deploy-image checklist.** Code that works locally can
still fail in the image; before relying on something in production, confirm:

- Runtime file reads (assets, fixtures) resolve relative to `/bpni/build` and the files
  actually land there — via `scripts/copy_assets.sh` _and_ a `COPY` line in
  `deploy.Dockerfile` (the build stage only copies what's explicitly listed).
- Any package the script imports is in `dependencies`, not `devDependencies`.
- New npm tasks meant for production go through `scripts/batch.sh` (plain `ts-node`
  invocations will not run in the image).

## Docker image building

Build the image

`docker build . -t bpni:latest`

Run mongodb

`docker run -d -p 27017:27017 mongo:8.0.23`

Run the image and backend

`docker run -d -p 3000:3000 -e JWT_SECRET=mysecretkey -e ENV_NAME=development -e CAPTCHA_SITE=localhost -e CAPTCHA_SECRET=mysecretkey -e DB_URI="mongodb://127.0.0.1:27017/blueprintnotincluded" bpni:latest`

Visit http://localhost:3000

## Game asset import

**Local dev checkout only** — the importer runs from TypeScript sources with
devDependencies and reads the `export/` drop, none of which exist in the deploy image;
its outputs (`database-2024.json`, synced sprites) are committed, so production only
ever consumes the results. Drop a fresh OniExtract2024 export into `export/`, then:

```bash
npm run import:2024:dry-run   # validate + report only
npm run import:2024           # regenerate database-2024.json + sync sprites into both asset roots
```

Contract and converter details: `app/api/batch/convert-export-2024.md`. The legacy
2020-era atlas pipeline (`generateIcons`/`generateGroups`/…) is retired.

## Version tracking

The About dialog and `GET /api/version` report version (`package.json`), commit, branch,
build time, and environment. In production these come from `BUILD_DATE` / `GIT_COMMIT` /
`GIT_BRANCH` / `ENV_NAME` build args, wired up by `.github/workflows/publish.yml`; in dev
they fall back to git detection at server start.
