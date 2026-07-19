# Repository instructions for coding agents

Read `CLAUDE.md` before doing substantive work. Despite its name, it is the canonical
repository guide for all coding agents: architecture, development commands, test setup,
asset-pipeline details, and project-specific constraints live there. Consult the focused
documents in `agent/` and `spec/` when a task touches those areas; do not assume status
headings in older notes are current.

## Safety and scope

- Do not circumvent safeguards or search for credentials, tokens, or alternate access
  paths. If required access is unavailable, stop and ask the user.
- Local code edits and local development commands made in good faith for the current task
  are in scope. Keep changes narrowly related to the request and preserve unrelated work.
- Never make changes on `master`. Before editing, verify the current branch and worktree.
  If currently on `master`, create or request a task branch before changing files.
- Do not commit, push, open a PR, or mutate external systems unless the user asks for that
  action. Do not attempt production fixes or production writes without the user working
  with you. Read-only production inspection is acceptable only when relevant and requested.
- Treat `.env*`, database dumps, and production-derived data as sensitive. Do not print,
  commit, or inspect secrets unrelated to the task.

## Repository conventions

- Use Node 20.19.x (Volta pins 20.19.4); do not upgrade this project to Node 22 because
  the Canvas toolchain requires Node 20.
- Backend tests use Mocha + Chai. Do not introduce Jest.
- Frontend tests use the Angular builder with Vitest. Run a single spec with
  `npm test -- --include='**/name.spec.ts'` from `frontend/`; do not invoke bare Vitest on
  a spec path.
- The backend has no ESLint configuration. Frontend lint is `npm run lint` from
  `frontend/`. Do not use a repo-wide formatting pass for a focused change.
- Use the 2024 flat-icon asset pipeline documented in
  `app/api/batch/convert-export-2024.md`; do not restore the retired atlas pipeline.
- Production-runnable batch tasks must dispatch through `scripts/batch.sh`, and every
  runtime asset must be included in the deploy image as described in `README.md`.

## Validation

Choose checks proportional to the change. The full pre-flight sequence, fastest first, is:

1. `npm run build:lib`
2. `npm run tsc`
3. `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
4. `cd frontend && npm run lint`
5. `cd frontend && npm test`
6. `npm test`

Backend `npm test` performs database setup and therefore requires the local Mongo service.
For tests that do not need a fresh database setup, use `npm run test:only`.
