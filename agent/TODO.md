# Agent TODO - Blueprint Not Included

## Current Status
- **Phase**: Multilingual search + content locale — fully shipped AND activated in prod
  (2026-08-27): migrations, Vietnamese-title gate (PR #210 + #211), full derive-search
  backfill, precision audit clean
- **Date**: 2026-08-27
- **Branch**: `master`
- **Stack**: Node 20.19.4 · TypeScript 5.9.3 strict · Mongoose 8.24 · Express 5.2 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 1072 backend (Mocha + Chai) · 1226 frontend (Vitest, 2 skipped) — all green
- **Enforcement**: zero-warning flags enabled backend, lib, and frontend (`strict` + `strictTemplates`); CI improvements all complete (mongo:8.0.23 + mongosh health check)

## Prod activation — DONE 2026-08-27

Migrations applied (validated by DB fingerprints — the `migrations` changelog collection was
found inexplicably empty and had to be restored from a dump; if `migrate:status` ever shows
"all pending" again, check the collection before believing it). Gate enabled, full backfill
run: 2,378 titles / 199 Gemini calls / 26 accepted / 0 failed batches / ~$0.24 observed.
Precision audit (`search-followups.md` Part 1 §5): zero unchanged-title machine rows.
Verified live in both query directions. Rollout trail: `spec/archive/rollout-vi-gate.md`
(local).

## Multilingual search — what's left

Full detail in `spec/multilingual-search-plan.md` §4.5 and `spec/search-followups.md`.

- **Guard game jargon from the Google translation passes** — found in prod 2026-08-27:
  Google confidently mistranslates short all-jargon titles it misreads as another language
  (`drecko` → "Shit", `10 dupe SPOM` → "10 ass SPOM", SPOM → "memory", pacu → "race"; 89
  rows reverted and cache-pinned). The term-dictionary fully-resolved filter only guards the
  Gemini census — extend it to the Google continuation and phase-3b passes, and consider
  adding `drecko`/`pacu`/`dupe`/`puft` to `assets/search-aliases.json`. **Do before any full
  re-derive** — the cache pins protect the 52 known titles, not the class.
- **Sticky "always show original titles"** (followups §2.12) — does an English reader ever
  want the authored title instead? Product question, not mechanical.
- **Phase 6 — semantic retrieval**, only if `searchqueries` telemetry justifies it. It held
  ~2 dev rows as of 2026-08-04; needs real production traffic first.
- **IDF weighting for structural matches** (plan §2.3 B) — still ordered by raw matched-id
  count.
- **`.po` acquisition** for non-English term dictionaries (plan §7.3) — research and
  licensing, not engineering, but it caps how good non-English search gets at zero cost.
- **Near-duplicate clustering** (plan §2.5 signal 2, multiset Jaccard) — needs a global
  pass, so it was skipped in phase 2. Its consumer, the **fork-migration offer to cluster
  members**, is the feature whose absence produced 86 copies of one ranch.

## OniExtract2024 follow-ups

Open items only (import pipeline, render cutover, legacy-pipeline removal, and English
`po_string` → `strings.json` flattening are done; see `app/api/batch/convert-export-2024.md`).

- **Rename `import:2024`** to a version-neutral name — "2024" leaked everywhere from the
  milestone. Keep an alias for one cycle (`convert:2024` already aliases it).
- **`uiImageRect` rollout (export side):** 342/487 buildings carry it; the rest fall back to
  stretch-to-footprint. Emit it for the deviating buildings. All 31 terrain features now
  carry one, delivered via `ui_image_rects.json` at the export root; the importer fails on
  any rect whose aspect disagrees with its PNG.
- **Unread export JSONs (7 of 13):** `items`, `food`, `recipe`, `multiEntities`, `tags`,
  `attribute`, `db` — future capabilities (critters/recipes/etc.), nothing wired yet.
  `geyser` and `entities` are read for the terrain catalogue only; the rest of `entities`
  (critters/plants) is still unused. Non-English i18n still open: site has zh/ru/ko but the
  export ships English only.
- **Modded buildings — data layer shipped** (`mod`/`modTitle` on buildings, mods index in
  the DB, `blueprint.mods` server-derived + latched `modded: true`, `GET /api/mods`). 473
  buildings (449 vanilla + 24 modded from 6 Steam Workshop mods) as of this export. UI
  (build-menu badges, details-page mod chips, `/mods` page, editor-open mod notice) is a
  separate follow-up PR — nothing consumes `mods` client-side yet.

## DLC requirements: replace ordered `gameVersion` with a requirement set

**Step 1 shipped** (lib + backend + derivation, no visible change); steps 2–5 open. Full
plan in `spec/dlc-requirements-plan.md`.

DLCs are optional and unordered: anyone can own any combination, so a blueprint carries the
*set* of DLCs it needs (`requiredDlcs: string[]`, `[]` = base game), not a single ordered
"version". The current `deriveGameVersion` returns only the highest-priority DLC found, which
can't express "needs both Frosty and Bionic" and can't answer "does this fit what I own".

Two filters fall out: hide blueprints needing packs the player doesn't own, and show
blueprints from one pack so they can judge whether it's worth buying.

Multiple `dlcIds` on one building mean AND, so union across buildings is the right
composition. Spaced Out is deliberately *not* modelled as the mode it really is — treating
`EXPANSION1_ID` like every other id keeps filtering explainable, and requirements come from
blueprint content rather than the author's setup (a Spaced Out player building only classic
content produces an empty set that anyone can build).

**Store Klei's raw DLC ids** (`DLC3_ID`), not our own slugs, with a display-label map in one
place. That removes the naming blocker entirely and makes the existing mislabel impossible —
`DLC5_ID` is currently tagged `bionicBooster` but is really the aquatic pack; the real Bionic
Booster content is `DLC3_ID`, which arrived with the U59-740622 export alongside a
Prehistoric pack on `DLC4_ID`.

Shipped in step 1: `deriveRequiredDlcs` + `DLC_LABELS`/`dlcLabel` in lib, `requiredDlcs` on
the blueprint schema (indexed, server-derived on every save/fork/version-restore), emitted in
the list/details/editor responses, derived by `derive-metadata`, and a display-label contract
test in place of the retired `pendingDlcIds` allowlist. Labels are the game's own
`STRINGS.UI.<id>.NAME` — `DLC5_ID` is "The Aquatic Planet Pack", `DLC4_ID` "The Prehistoric
Planet Pack" — which settles the plan's only open naming question.

Still open: step 2 (`dlc=` filter + display chips), step 3 (`owned=` subset filter, and
whether ownership becomes a stored user preference), step 4 (drop `gameVersion` from schema,
responses, indexes and frontend once nothing reads it), step 5 (elements).
Element-level DLC provenance is blocked upstream: `elements.json` carries no DLC field, so
that needs an export-side request. Backfill is not a gate — `derive-metadata` recomputes
from stored building ids whenever we choose to run it; until then old blueprints have no
`requiredDlcs` and read as base-game.

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
- **Star ratings v2 — SHIPPED with the reskin branch.** Likes are fully replaced by
  per-user 1–5 ratings: `blueprintratings` collection (unique user+blueprint), POST
  `/api/rateblueprint`, aggregate denormalized as `ratingCount`/`ratingAverage` on the
  blueprint and recomputed server-side per write
  (`BlueprintController.recomputeRatingAggregate` — never at read time). Self-rating is
  forbidden; uploads/forks start unrated; `popular` sort = rating desc ("Top rated");
  profile tab is "Rated" (`ratedBy` param). Migration
  `20260716000000_replace-likes-with-ratings` seeded 5-star ratings from non-author
  likes. Remaining follow-ups:
  - **Rating algorithm v2**: swap the plain average for a recency-weighted score — a
    change inside `recomputeRatingAggregate` + a batch re-run over all blueprints; no
    client or schema change.
  - **Likes cleanup migration**: `$unset` the orphaned `likes`/`likeCount` fields once
    the rollout is proven (they're out of the mongoose schema already).

## Trending ranking (hotScore) follow-ups

Trending is now a materialized, indexed `hotScore` ("new but also good": bayesian-shrunk
rating + log downloads + a static recency term) and the default Discover sort. Design +
calibration: `spec/trending-hotscore-plan.md`; scoring lives in `lib` `computeHotScore`.
Deferred, both metrics-gated:

- **Filter-scoped trending indexes** — only the unfiltered `{deletedAt, isPublished,
  hotScore:-1, createdAt:-1}` index shipped. Whether to add gameVersion/category/rooms +
  hotScore compound indexes depends on which filters users actually pair with trending;
  instrument that first (filtered trending currently falls back to a non-covered sort).
- **Re-tune constants against real data** — `PRIOR_MEAN` (`C`, provisional 3.5) and
  `W_RECENCY` (0.18 → ~2-week window) were set before there was meaningful rating volume.
  Revisit once ratings/downloads accumulate; any change is a one-line edit to `HOT_SCORE`
  plus a fresh backfill migration to re-materialize.

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

0. **Activate PR #206 in prod** — migrate, then `derive-search`. See the blocking section
   above; nothing about the content-locale feature works until this runs.
1. Rename `import:2024` to a version-neutral script name (keep alias one cycle).
2. Export side: emit `uiImageRect` for the 145 buildings still missing it.
3. Monitor WorkOS legacy-user migration (`GET /api/migration/status`); retire the legacy
   migration path when counts hit zero — see `agent/WORKOS_PLAN.md`.
4. Pick the next product increment: blueprint forks (`spec/FORKS.md`), or wiring one of the
   unread export JSONs (critters/recipes/i18n).
5. Comment system follow-ups (deferred per `spec/COMMENT_SYSTEM.md`): tile-pinned comments,
   in-app notifications, "hidden by author" state, edit history (edits shipped 2026-07-06
   as true edits with an "(edited)" tag; only the current body is stored).
