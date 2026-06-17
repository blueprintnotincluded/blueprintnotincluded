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
The application processes game assets for blueprint visualization:
- `npm run generateIcons` - Generate sprite icons from game assets
- `npm run generateGroups` - Process sprite groupings
- `npm run generateWhite` - Generate white-background variants
- `npm run generateRepack` - Repack asset database
- `npm run fixHtmlLabels` - Fix HTML formatting in labels

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

See `agent/CI_IMPROVEMENTS.md` for a prioritized list of known CI issues.

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
- `npm run test:coverage` generates a text summary + lcov report
- CI runs `test:coverage` so every PR shows a coverage table in the job log
- Renderer (`DrawPixi`, PIXI) is always mocked in unit tests — never instantiate real PIXI in specs

## Current Status

- **Phase**: Phase 6 - Final Optimization (all dependency upgrades complete)
- **Date**: 2026-06-16
- **Node.js**: 20.19.4 (via volta)
- **Stack**: TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: ✅ Backend 141 passing (Mocha + Chai) · Frontend Vitest/jsdom, all green
- **Build**: ✅ `npm run tsc` clean · `npm run build` clean

### Session Management Files
Check these files in `agent/` directory for current status:
- `agent/TODO.md` - Improvement roadmap and remaining work
- `agent/SESSION_NOTES.md` - Session-by-session progress
- `agent/CI_IMPROVEMENTS.md` - GitHub Actions improvements (all complete)
- `UPGRADE_PLAN.md` - Upgrade history and strategy

### Quick Status Check Commands
```bash
# Environment verification
node --version        # Should be 20.19.4
npm run test         # Should pass 141 tests
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

Migration scripts live in `app/api/batch/`. Validation script: `scripts/migration/validate-data-shape.ts`.

### Credential rules
- Admin URI (`doadmin`) — DO app console env only. Never on local machine.
- `doctl` — not installed. Removed to eliminate a path to admin credentials.
- Read-only URI — `/.env.migration` (gitignored). Safe to store; cannot write to DB.
- `/.env` — local dev only. Never put prod or staging credentials here.
- `/prod-dump/` — gitignored. Real prod data; never commit.

### Pre-merge process for every migration
```bash
# 1. Tests pass
npm run test

# 2. Smoke-test scripts run without errors (local DB is empty outside tests — that's fine)
DB_URI=mongodb://localhost:27017/bpni npm run migrate:validate
DB_URI=mongodb://localhost:27017/bpni npm run migrate:dry-run

# 3. Dump prod using read-only credentials
source .env.migration
mongodump --uri="$PROD_READONLY_URI" --out=./prod-dump

# 4. Restore prod dump locally under a separate DB name
mongorestore --uri="mongodb://localhost:27017" --db="bpni-prod" --drop ./prod-dump/blueprintnotincluded

# 5. Run against real prod data — this is where you catch actual problems
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:validate
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:dry-run
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:run
# Inspect results — validate counts match expectations before proceeding
```

### Post-deploy execution (DO app console)
```bash
# DO dashboard → prod cluster → Backups → Create backup now  (wait for completion)
npm run migrate:dry-run   # one final check
npm run migrate:run
npm run migrate:validate  # confirm counts match expectations (deletedTrue == deletedAtSet, deletedFalse+deletedMissing == deletedAtNull, deletedAtMissing == 0)
```

### Rollback
DO dashboard → Backups → restore pre-migration snapshot to a new cluster → update `DB_URI` env var in App Platform to point at restored cluster.

### Migration script rules
- Never `$unset` the old field in the same operation that reads it as a filter — the filter breaks once the field disappears. Set new fields first, verify, clean up old fields separately.
- Always support `--dry-run` that reports counts without writing.
- Leave orphaned old fields in place after migration; they disappear naturally once removed from the Mongoose schema.

---

## Important Instructions
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.