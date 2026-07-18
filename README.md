# Blueprintnotincluded

This is the source repo of blueprintnotincluded.org

It is a combined curated version of the original blueprintnotincluded web app.

## Development Setup

### Development (Recommended)
For ARM64 Macs and local development with live reloading:

```bash
# One-time setup: copy environment configuration
cp .env.sample .env

# Start dependencies only (database + mail)
./dev-setup.sh

# In separate terminals:
npm run dev              # Backend with live reloading
cd frontend && npm start # Frontend with live reloading
```

- **Frontend**: http://localhost:4200 (Angular dev server with API proxy)
- **Backend API**: http://localhost:3000 (Express with ts-node-dev)
- **Database**: mongodb://localhost:27017
- **Mail testing**: http://localhost:8025 (Mailpit web UI)

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
npm run avatars:smoke
npm run avatars:seed-batch -- --count 10
npm run derive-metadata:dry-run
npm run backfill-previews
```

Batch tasks dispatch through `scripts/batch.sh`, which runs the compiled
`app/api/batch/<name>.js` when it exists (deploy image) and falls back to `ts-node` on the
`.ts` source (dev checkout). Direct invocation also works as a fallback:
`node app/api/batch/<name>.js [args]` (no `--` separator needed).

**Shipping new batch/asset code — deploy-image checklist.** Code that works locally can
still fail in the image; before relying on something in production, confirm:

- Runtime file reads (assets, fixtures) resolve relative to `/bpni/build` and the files
  actually land there — via `scripts/copy_assets.sh` *and* a `COPY` line in
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

## Image reconstruction
Export iamges from oniextract2020
Copy assets/manual/ into assets/images
`npm run fixHtmlLabels -- database.json`
`npm run addInfoIcons -- database.json`
`npm run generateIcons`
`npm run generateGroups`
`npm run generateWhite`
`npm run generateRepack`
zip assets/database/database.json
copy zip to frontend/src/assets/database
copy assets/database/database-repack.json to frontend/src/assets/database.json