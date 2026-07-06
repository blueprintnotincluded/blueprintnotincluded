# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Social evolution — likes, auto-derived metadata, profiles/follows/activity feed, blueprint comments, and the blueprint details page all shipped
- **Date**: 2026-07-06
- **Branch**: `master`
- **Stack**: Node 20.19.4 · TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 320 backend (Mocha + Chai) · 567 frontend (Vitest, 2 skipped) — all green
- **Enforcement**: zero-warning flags enabled backend, lib, and frontend (`strict` + `strictTemplates`); CI improvements all complete (mongo:8.0.23 + mongosh health check)

## OniExtract2024 follow-ups

Open items only (import pipeline, render cutover, legacy-pipeline removal, and English
`po_string` → `strings.json` flattening are done; see `app/api/batch/convert-export-2024.md`).

- **Rename `import:2024`** to a version-neutral name — "2024" leaked everywhere from the
  milestone. Keep an alias for one cycle (`convert:2024` already aliases it).
- **`uiImageRect` rollout (export side):** 342/449 buildings carry it; the rest fall back to
  stretch-to-footprint. Emit it for the deviating buildings.
- **Unread export JSONs (9 of 13):** `entities`, `items`, `food`, `geyser`, `recipe`,
  `multiEntities`, `tags`, `attribute`, `db` — future capabilities (critters/recipes/etc.),
  nothing wired yet. Non-English i18n still open: site has zh/ru/ko but the export ships
  English only.

## Future directions (product)

- **Blueprint forks** — fork/remix an existing blueprint with attribution (was queued with
  profiles; profiles shipped, forks did not).

## Future Security Improvements

Deferred — no active sprint. (Email verification for new registrations shipped with the
WorkOS in-app auth work; rate limiting is Cloudflare's job — do not add express-rate-limit.)

- **Account Lockout** — track failed attempts; lock 15 min after 5 failures
- **Password Strength** — enforce complexity; consider `zxcvbn`
- **JWT Hardening** — refresh mechanism, logout blacklisting
- **HTTPS Enforcement** — HTTPS redirect middleware + HSTS header in production
- **Input Sanitization** — strengthen beyond current username regex; XSS protection for user content
- **Security Logging** — structured log for auth events

## Future Test Coverage

- **Asset Processing** — `__tests__/asset-processing/*` validate the `database-2024.json`
  shape + synced sprite assets; extend as the import pipeline grows
- **Frontend high-value deferred** (largest uncovered code):
  - `component-canvas.component.ts` — main draw pipeline, drags PIXI
  - `component-blueprint-parent.component.ts`
  - `draw-pixi.ts` / `draw-mini-ui.ts` — requires full PIXI mock; defer
  - `custom-event-manager` directive — defer

## Future Technical Debt

- **API Documentation** — no OpenAPI/Swagger spec exists
- **Bundle size** — production bundle ~3.25 MB, budget `3.5mb warn / 4mb error`; tightening
  further requires real reduction work (tree-shaking pixi.js, lazy-loading PrimeNG modules)

---

## Next steps

1. Rename `import:2024` to a version-neutral script name (keep alias one cycle).
2. Export side: emit `uiImageRect` for the ~107 buildings still missing it.
3. Monitor WorkOS legacy-user migration (`GET /api/migration/status`); retire the legacy
   migration path when counts hit zero — see `agent/WORKOS_PLAN.md`.
4. Pick the next product increment: blueprint forks (`spec/FORKS.md`), or wiring one of the
   unread export JSONs (critters/recipes/i18n).
5. Comment system follow-ups (deferred per `spec/COMMENT_SYSTEM.md`): tile-pinned comments,
   edit window, in-app notifications, "hidden by author" state.
