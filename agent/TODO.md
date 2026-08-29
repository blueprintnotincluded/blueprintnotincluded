# Agent TODO - Blueprint Not Included

## Current Status

- **Phase**: building-settings editing shipped (PR #212). Multilingual search + content
  locale fully shipped AND activated in prod (2026-08-27) — status doc `spec/language-plan.md`
- **Date**: 2026-08-28
- **Stack**: Node 20.19.4 · TypeScript 5.9.3 strict · Mongoose 8.24 · Express 5.2 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 1072 backend (Mocha + Chai) · 1226 frontend (Vitest, 2 skipped) — all green
- **Enforcement**: zero-warning flags enabled backend, lib, and frontend (`strict` + `strictTemplates`); CI improvements all complete (mongo:8.0.23 + mongosh health check)

## Search / translation — what's left

Status doc: `spec/language-plan.md`. Design rationale: `spec/archive/multilingual-search-plan.md`
and `spec/archive/search-followups.md`. (All `spec/` docs are local — the directory is
gitignored, so these exist only on the dev machine, not in a clean checkout.) Prod activation
completed 2026-08-27 (2,378 titles, ~$0.24, precision audit clean); rollout trail in
`spec/archive/rollout-vi-gate.md` (local). If
`migrate:status` ever claims "all pending", check the `migrations` collection before believing
it — it was once found inexplicably empty and had to be restored from a dump.

- **Guard game jargon from the Google translation passes** — found in prod 2026-08-27:
  Google confidently mistranslates short all-jargon titles it misreads as another language
  (`drecko` → "Shit", `10 dupe SPOM` → "10 ass SPOM", SPOM → "memory", pacu → "race"; 89
  rows reverted and cache-pinned). The term-dictionary fully-resolved filter only guards the
  Gemini census — extend it to the Google continuation and phase-3b passes, and consider
  adding `drecko`/`pacu`/`dupe`/`puft` to `assets/search-aliases.json`. **Do before any full
  re-derive** — the cache pins protect the 52 known titles, not the class.
- **Sticky "always show original titles"** (archived followups §2.12) — does an English
  reader ever want the authored title instead? Product question, not mechanical.
- **Phase 6 — semantic retrieval**, only if `searchqueries` telemetry justifies it.
- **IDF weighting for structural matches** — still ordered by raw matched-id count.
- **`.po` acquisition** for non-English term dictionaries — research and licensing, not
  engineering, but it caps how good non-English search gets at zero cost.
- **Near-duplicate clustering** (multiset Jaccard) — needs a global pass, skipped in phase 2.
  Its consumer, the **fork-migration offer to cluster members**, is the feature whose
  absence produced 86 copies of one ranch.

## OniExtract2024 follow-ups

Done (see `app/api/batch/convert-export-2024.md`): the import pipeline, the flat-icon
render cutover, legacy-pipeline removal, English `po_string` → `strings.json` flattening,
and the whole modded-buildings feature — both the data layer (`mod`/`modTitle`,
`blueprint.mods`, `GET /api/mods`) and its UI (build-menu badges, details-page mod chips,
the `/mods` supported-mods page).

Open items:

- **Rename `import:2024`** to a version-neutral name — "2024" leaked everywhere from the
  milestone. Keep an alias for one cycle (`convert:2024` already aliases it).
- **`uiImageRect` rollout (export side):** 342/487 buildings carry it; the rest fall back to
  stretch-to-footprint. Emit it for the deviating buildings.
- **Unread export JSONs (7 of 13):** `items`, `food`, `recipe`, `multiEntities`, `tags`,
  `attribute`, `db` — future capabilities (critters/recipes/etc.), nothing wired yet.
  `geyser` and `entities` are read for the terrain catalogue only. Non-English i18n still
  open: site has zh/ru/ko builds but the export ships English only.

## DLC requirements — shipped; one upstream gap

Steps 1–4 all shipped (PRs #177/#178/#180 + `feat/drop-game-version`): `requiredDlcs`
derived on every save/fork/restore, `?dlc=`/`?excludeDlc=` filters, sidebar facet groups,
user exclusion preference, and `gameVersion` deleted from lib/schema/UI (migration
`20260726015329`). Prod backfill ran 2026-07-25. Design history:
`spec/archive/dlc-requirements-plan.md`.

- **Step 5 — element-level DLC provenance** is blocked upstream: `elements.json` carries no
  DLC field; needs an export-side request.

## Ratings follow-ups

Star ratings v2 shipped (per-user 1–5 ratings, `blueprintratings`, denormalized
`ratingCount`/`ratingAverage`, `popular` = "Top rated").

- **Rating algorithm v2**: swap the plain average for a recency-weighted score — a change
  inside `recomputeRatingAggregate` + a batch re-run; no client or schema change.
- **Likes cleanup migration**: `$unset` the orphaned `likes`/`likeCount` fields once the
  rollout is proven (already out of the mongoose schema).

## Trending ranking (hotScore) follow-ups

Trending is a materialized, indexed `hotScore` and the default Discover sort (design:
`spec/archive/trending-hotscore-plan.md`; scoring in lib `computeHotScore`). Deferred,
both metrics-gated:

- **Filter-scoped trending indexes** — only the unfiltered index shipped; instrument which
  filters users pair with trending before adding compounds.
- **Re-tune constants against real data** — `PRIOR_MEAN` (3.5) and `W_RECENCY` (0.18) were
  set before there was meaningful rating volume. Any change is a one-line edit to
  `HOT_SCORE` plus a backfill migration to re-materialize.

## Future directions (product)

- **Blueprint forks** — fork/remix with attribution (`spec/archive/FORKS.md` design;
  profiles shipped, forks did not).
- **Comment system follow-ups** (deferred per `spec/archive/COMMENT_SYSTEM.md`): tile-pinned
  comments, in-app notifications, "hidden by author" state, edit history.
- **Category subcategories** — split the big Power/Cooling/Automation buckets by detected
  signature buildings; raw notes in `spec/subcategories.md`.

## Future Security Improvements

Deferred — no active sprint. (Email verification shipped with WorkOS in-app auth; rate
limiting is Cloudflare's job — do not add express-rate-limit.)

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

Code-review plans (2026-08-28, `spec/code-review-2026-08.md`, local). Items 1/2/8 shipped
(PRs #216, #217, #218): `getFeed` missing `-rawSource`; dead passport auth path + unused
deps; the concluded diacritic A/B experiment dir. Remaining: lib compiles into `lib/src`
(71 committed generated `.d.ts`); split 1,867-line `blueprint-controller.ts`; remove
dormant `uiScreens` model; Angular standalone migration (unblocks bundle splitting);
preview-worker terrain/annotation parity.

- **API Documentation** — no OpenAPI/Swagger spec exists
- **Bundle size** — production bundle ~3.25 MB, budget `3.5mb warn / 4mb error`; tightening
  further requires real reduction work (tree-shaking pixi.js, lazy-loading PrimeNG modules)

---

## Next steps

1. **Jargon guard for Google translation passes** (top of Search section) — do before any
   full `derive-search` re-derive.
2. Rename `import:2024` to a version-neutral script name (keep alias one cycle).
3. Export side: emit `uiImageRect` for the buildings still missing it.
4. Monitor WorkOS legacy-user migration (`GET /api/migration/status`); retire the legacy
   migration path when counts hit zero — see `agent/WORKOS_PLAN.md`.
5. Pick the next product increment: blueprint forks, or wiring one of the unread export
   JSONs (critters/recipes/i18n).
