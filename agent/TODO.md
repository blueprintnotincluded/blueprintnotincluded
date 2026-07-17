# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Social evolution — likes, auto-derived metadata, profiles/follows/activity feed, blueprint comments, and the blueprint details page all shipped
- **Date**: 2026-07-06
- **Branch**: `master`
- **Stack**: Node 20.19.4 · TypeScript 5.9.2 strict · Mongoose 8.18.1 · Express 5.1.0 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 326 backend (Mocha + Chai) · 573 frontend (Vitest, 2 skipped) — all green
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

## Steam reskin follow-ups

The discover section wears the Steam Workshop skin (branch `steam-reskin`; art direction:
`spec/Steam Style Guide (standalone).html`, sampled from `spec/steam-bni.png`). Deferred
guide items, both needing backend work:

- **Facet counts** — per-facet blueprint counts in the browse sidebar, right-aligned dim
  grey ("Power (1,368)"). One aggregation endpoint (`$group` over non-deleted published
  blueprints by category / gameVersion / rooms); render into the existing
  `.bni-facet-count` slot (already styled in `bni-skin.css`).
- **Per-page backdrop** — /blueprint/:id replaces the flat void with Effect A (blurred
  `blur(28px) saturate(.7) brightness(.55)` + gradient overlay) using that blueprint's own
  preview. Cache a tiny ~64px variant (previewimages collection already stores renders);
  the blur hides the resolution.
- **No carousel.** Considered and rejected — do not resurrect the "featured strip" as one.
- **Star ratings v2 — replace likes with real ratings.** The shipped `app-star-rating`
  (stars derived from like counts) is an explicit placeholder; like volumes are too low
  for it to mean much. Target design, mirroring the write-behind pattern that made
  likes/views scalable (`BlueprintCounterService`, PR #129):
  - Users rate a blueprint 1–5 stars (replaces the like interaction).
  - Per-user ratings stored in their own collection (one doc per user+blueprint, like
    `blueprintlikes`), so a user can change their rating and recency is queryable.
  - The **aggregate** rating is denormalized onto the blueprint document itself — list
    and detail views never aggregate at read time.
  - Aggregation runs **out of band** (write-behind flush or batch job), because the
    algorithm will change: start with the plain average, later prefer recent ratings
    (recency-weighted / time-decay). Keeping computation server-side and async means
    retuning the algorithm is a batch re-run, not a client or schema change.
  - `app-star-rating` then just renders the stored aggregate; `starsFromLikes()` and its
    log-scale mapping are deleted.

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
   in-app notifications, "hidden by author" state, edit history (edits shipped 2026-07-06
   as true edits with an "(edited)" tag; only the current body is stored).
