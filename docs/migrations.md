# Database migrations & GitHub/CI reference

Operational reference for migrate-mongo migrations and the `gh` CLI. See
root `CLAUDE.md` for project-wide setup, commands, and constraints.

## GitHub & CI

The `gh` CLI is available and authenticated. Use it for all GitHub operations rather than
constructing URLs manually.

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

- `backend-test.yml` — runs on push to master when backend paths change, and on every pull
  request to `master` (the `paths` filter only applies to the `push` trigger)
- `frontend-test.yml` — runs on push to master when frontend paths change, and on every pull
  request to `master` (same path-filter caveat)
- `publish.yml` — on push to master only: builds the deploy image, pushes it to ghcr.io as
  `:latest` and deploys it to staging over SSH
- `promote.yml` — manual: retags `:latest` → `:prod` on ghcr.io (or rolls back) and deploys
  production over SSH; gated by the `production` environment. Hosting runbook:
  `deploy/README.md`

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
- Removing a field from the Mongoose schema does not remove it from existing documents —
  it just stops being read/written. Leaving it in place is fine when that's intentional;
  otherwise remove it from stored documents in a separate, verified cleanup migration.

### Credential rules

- Production and staging secrets (Mongo passwords, tunnel tokens, R2 keys, the app's
  env) live only in `/srv/bpni/<project>/.env` and `app.env` on the Hetzner server, mode
  600, owner `deploy`. The repo ships `deploy/env/*.example`; never a filled-in copy.
- The database is the `mongo` service of each compose project, reachable from that
  project's network only (no host port, no public URI). Root in mongosh:
  `deploy/bin/compose.sh production exec mongo mongosh -u root -p … --authenticationDatabase admin`.
- Server access is key-only SSH as `deploy`; the workflows use the `DEPLOY_SSH_KEY`
  repository secret. Nothing on the box is reachable from this dev container.
- Dumps for a local rehearsal come from R2 (`rclone copy r2:bpni-backups/bpni-production/daily/<archive>`
  with the scoped R2 token) or from the box's `/srv/bpni/dumps/`.
- `/.env` — local dev only. Never put prod or staging credentials here.
- `/prod-dump/` — gitignored. Real prod data; never commit.
- DigitalOcean (cut over from on 2026-10-25) stays untouched until its decommission; its
  URIs live only in the DO console, `doctl` stays read-only, and nothing on DO is changed
  from here.

### Pre-merge process for every migration

```bash
# 1. Tests pass
npm run test

# 2. Check status and run against local DB
npm run migrate:status
npm run migrate:up

# 3. Fetch last night's production archive from R2 (previewimages excluded — fine for a rehearsal)
rclone copy r2:bpni-backups/bpni-production/daily/<newest>.archive.gz ./prod-dump/

# 4. Restore it locally under a separate DB name
mongorestore --uri="mongodb://localhost:27017" --nsFrom='blueprintnotincluded.*' --nsTo='bpni-prod.*' --drop --gzip --archive=./prod-dump/<archive>

# 5. Run against real prod data — this is where you catch actual problems
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:status
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:up
# Inspect results before proceeding
```

### Post-deploy execution (on the server)

Rehearse on staging first — it has its own database, a copy of production:

```bash
cd /srv/bpni/deploy
bin/compose.sh staging exec app npm run migrate:status
bin/compose.sh staging exec app npm run migrate:up
```

Then production, after an ad-hoc dump:

```bash
bin/compose.sh production exec backup backup.sh          # dump to R2 now (wait for "done")
bin/compose.sh production exec app npm run migrate:status   # confirm which migrations are pending
bin/compose.sh production exec app npm run migrate:up
```

**A freshly seeded server** (`deploy/bin/seed-from-dump.sh`) carries the `migrations`
tracking collection from the dump, so `migrate:status` reports everything applied and
`migrate:up` has nothing to do. If the collection is ever missing, `migrate:up` re-runs
every migration from the beginning; they are written to be idempotent for that reason
(the ported Migration 1, `20260403000000_blueprint-deleted-to-deletedAt`, filters on
`{ deletedAt: { $exists: false } }` so it no-ops on already-migrated documents).

### Rollback

`npm run migrate:down` rolls back the last migration via its `down` method (inside the
app container: `bin/compose.sh production exec app npm run migrate:down`).
For a full restore from the pre-migration archive: `deploy/README.md` → Database → Restore
(`bin/seed-from-dump.sh production restore <archive>`; previews re-render afterwards).
