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
- `publish.yml` — deploys to DigitalOcean on push to master only

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
