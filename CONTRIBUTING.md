# Contributing to Blueprintnotincluded

Thank you for considering a contribution — external PRs are genuinely welcome
here, and small ones are just as valued as big ones.

## The maintainer's philosophy

**Safe, positive contributions get merged.** You don't need to match the house
style perfectly or anticipate every edge case — if your change works, is
tested, and doesn't break anything, it will be accepted, and any cleanup the
maintainer cares about happens afterwards in follow-up commits. Don't let
polish anxiety stop you from opening a PR.

AI-assisted contributions are welcome. Please say so in the PR description
(the PR template has a place for it) — recent AI-assisted PRs here have been
excellent precisely because they disclosed what was verified by a human and
what wasn't.

## Getting set up

The full toolchain (Node, native build deps for `canvas`/`sharp`, MongoDB,
Mailpit) lives in a dev container — the host needs only a container runtime:

```bash
cp .env.sample .env
docker compose --env-file .env -f .devcontainer/docker-compose.yml up -d
docker compose --env-file .env -f .devcontainer/docker-compose.yml exec app bash
# then, inside the container, first run only:
npm ci && (cd frontend && npm ci) && npm run build:lib && npm run migrate:up
```

Frontend: http://localhost:4200 · Backend: http://localhost:3000

To work on the host instead, use Node **20.19.4** (see `.nvmrc`; Canvas 3.x
requires Node 20 — do not use Node 22) and run `./dev-setup.sh` to start just
the database and mail server.

More detail on the development environment lives in [CLAUDE.md](CLAUDE.md) —
it's written for AI agents but the commands are the same for humans.

## Before opening a PR

Run the checks that CI will run:

| Area | Commands |
| --- | --- |
| Backend | `npm run tsc` · `npm run test` (needs the database up) |
| Frontend | `cd frontend && npm run lint && npm test` |
| Frontend types | `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit` |

A few constraints worth knowing before you design a change:

- **Backend tests are Mocha + Chai; frontend tests are Vitest.** Do not
  introduce Jest.
- **Rate limiting is handled by Cloudflare** — don't add `express-rate-limit`.
- The frontend test runner wires globals through the Angular builder — run
  specs via `npm test -- --include='**/your.spec.ts'`, not bare `vitest <file>`.
- Commit messages follow conventional commits (`feat:`, `fix:`, `chore:`, …).

## What to expect after you open a PR

- **First-time contributors: CI waits for maintainer approval.** That's
  GitHub's default protection for fork PRs, not distrust — once your first PR
  is merged, later ones run automatically.
- An automated reviewer (CodeRabbit) usually comments first. Engage with it
  as you see fit — its findings are suggestions, and reasoned pushback is
  fine.
- The maintainer doesn't live in GitHub notifications; an alert for new PRs
  is planned (inactive until its Slack webhook is configured), so a day or
  two of latency can still happen. It's not a lack of interest.
