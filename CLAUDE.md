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
- `CAPTCHA_SITE`/`CAPTCHA_SECRET` - reCAPTCHA configuration
- `ENV_NAME` - Environment identifier
- `SMTP_HOST`/`SMTP_PORT` - Mail server configuration (defaults to localhost:1025)

## Database

Uses MongoDB 4.2 with Mongoose models in `app/api/models/`:
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

Uses Mocha with Chai and TypeScript support. Test files in `__tests__/` directory. The test database setup script creates a clean test environment.

### Testing Framework Notes
- **Framework**: Mocha with Chai (recommended by Mongoose team for MongoDB testing)
- **Expected Warnings**: 
  - MongoDB driver 3.x circular dependency warnings (will be resolved when upgrading Mongoose in Phase 2)
  - Blueprint API cast error logs in one test (documents existing backend validation bug)
- **Maintenance**: When removing large dependency sets, regenerate package-lock.json with `rm package-lock.json && npm install` to prevent corruption

## 🔄 Active Upgrade Process

### Current Status (2026-04-01)
- **Upgrade Phase**: Phase 2B - Mongoose upgrade (next up)
- **Build Status**: ✅ TypeScript 5.9.2 strict mode passing
- **Test Status**: ✅ 18/18 tests passing (Mocha + Chai)
- **Node.js**: 20.18.0 (via volta)
- **TypeScript**: 5.9.2 with strict checking (backend + lib)

### Session Management Files
Check these files in `agent/` directory for current status:
- `agent/TODO.md` - Improvement roadmap and priorities
- `agent/ASSESSMENT.md` - Detailed test coverage analysis  
- `agent/SESSION_NOTES.md` - Session-by-session progress
- `agent/CI_IMPROVEMENTS.md` - GitHub Actions improvement backlog
- `UPGRADE_PLAN.md` - Comprehensive upgrade strategy

### Quick Status Check Commands
```bash
# Environment verification
node --version        # Should be 20.18.0
npm run test         # Should pass 18 tests
npm run tsc          # Should compile without errors
git status           # Check working tree status

# GitHub CI status
gh run list --limit 5                    # Recent workflow runs
gh run view <run-id>                     # Details of a specific run
gh pr list                               # Open pull requests

# View current upgrade status
head -20 agent/TODO.md              # Current priorities
```

### Completed Phases
1. ✅ **Phase 1A**: Node.js 20.18.0 (volta + .nvmrc)
2. ✅ **Phase 1B**: lib TypeScript 3.5.3 → 5.9.2, ES2020 target
3. ✅ **Phase 2A**: Backend TypeScript 4.9.5 → 5.9.2, strict mode, ES2020
4. ✅ **Critical Bug**: Blueprint date validation CastError fixed (`blueprint-controller.ts:297`)

### Key Decision Points Made
1. **Testing Framework**: ✅ Mocha + Chai (Mongoose team recommendation)
2. **Node.js Target**: ✅ Node.js 20 LTS (Canvas 3.x compatibility)
3. **Angular Strategy**: ✅ Incremental 13→14→15→16→18→20
4. **Canvas Strategy**: ✅ Upgrade to 3.x with Node 20, avoid Node 22

### Next Steps
- **Phase 2B**: Mongoose 5.7.7 → 6.x → 7.x → 8.x (incremental)
- **Phase 3**: Express 4.x → 5.x
- **Phase 4**: Canvas 2.6.1 → 3.x
- **Phase 5**: Angular 13 → 20
- **CI Improvements**: See `agent/CI_IMPROVEMENTS.md` for prioritized list

### Important Constraints & Context
- Canvas package has Node.js 22 compatibility issues — stay on Node 20
- Angular 13→20 requires incremental approach (7 major versions, skip 17)
- Asset generation scripts depend on Canvas working correctly
- All test infrastructure is Mocha + Chai (do not introduce Jest)

---

## Important Instructions
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.