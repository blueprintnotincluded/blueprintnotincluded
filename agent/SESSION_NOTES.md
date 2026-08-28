# Session Notes - 2026-08-28

## Docs + code review (branch `docs-review`)

Project-wide docs audit. Deleted retired committed docs (`ASSET_PROCESSING_PLAN.md` —
described the removed 2020 atlas pipeline; `UPGRADE_PLAN.md` — all phases complete;
`VERSION_TRACKING.md` — condensed into a README section; `scripts/test-github-actions.md`
— pre-mongosh CI fix note). Fixed README's dead "Image reconstruction" section. Brought
CLAUDE.md and agent/TODO.md back in line with shipped reality: `gameVersion` is deleted
(DLC steps 1–4 shipped), the mod UI and facet counts shipped, search plan docs live under
`spec/archive/` with `spec/language-plan.md` as status doc, prod activation is done.

Local `spec/` pass: archived 14 shipped plan docs with dated banners (building-settings,
DLC ×2, element-notes ×3, theme-customizer, trending-hotscore, mod-import ×3, terrain
rects, ROADMAP + ROADMAP_DECISIONS); marked BPv2 followups task 3 (buildingData) shipped.

Code review findings → `spec/code-review-2026-08.md` (plans only, nothing implemented):
`getFeed` missing `-rawSource`, dead passport auth path, lib in-place compilation with 71
committed generated `.d.ts`, blueprint-controller split, dormant `uiScreens` removal,
Angular standalone migration, preview-worker annotation parity, experiments-dir retirement.

Flagged, not touched: `spec/icon-triage/` is 234MB of local scratch from the July icon
work — delete when confident it's no longer needed.

---

# Session Notes - 2026-08-26/27

## What We Accomplished ✅

### Prod activation of the multilingual-search + Vietnamese-title-gate work

The full rollout, runbook-driven (`spec/archive/rollout-vi-gate.md`, local): three local
rehearsals against a prod restore, two blockers found and fixed before prod spent a cent,
then migrations, promotion, backfill, and verification.

- **PR #211** — the 768 Gemini output-token cap truncated 113/199 batches with MAX_TOKENS
  (output counts completion + thought; a full 12-title batch measures ~716–800). Default
  raised to 2048; per-call reservation is now 4,096 micro-USD.
- **Google Cloud quotas** — three console quotas were at deliberately-tiny 1,000
  (chars/day, chars/min/user, req/min). Quota 403s are invisibly retried inside the v2
  client's gax layer until the app's 15s timer fires, so exhaustion logs as "Translation
  request timed out". All raised; the app-side `MONTHLY_CHAR_BUDGET` (400k chars ≈ $8/mo)
  is the binding cost guard.
- **Changelog wipe** — prod's `migrations` tracking collection was found empty despite 15
  recorded runs in the previous day's dump. Restored from the dump; both new migrations
  validated by DB fingerprints (index keys/weights, backfilled fields), which is the
  trustworthy check when `migrate:status` claims "all pending".
- **Pre-guard no-op cleanup** — 645 machine rows from the 2026-08-05 backfill were
  byte-identical to their authored titles (written before the "provider must change the
  text" guard); flipped back to authored so the run re-considered them properly.
- **The run** — 2,378 titles / 199 Gemini calls / 26 accepted (all correct) / 2,248
  continued to Google / 0 failed batches / ~$0.24 observed against a $1.50 cap. Precision
  audit: zero unchanged-title machine rows. Verified live both directions ("full
  electrolysis" ↔ `Dien Phan Z`).
- **Post-activation incident, fixed same day** — Google mangled short jargon titles
  (`drecko` → "Shit", `10 dupe SPOM` → "10 ass SPOM"; 52 titles / 89 rows). Reverted and
  cache-pinned to source text so re-derives can't re-apply them. Systemic guard is the new
  top open item in TODO.md.

PRs: #211 (token cap), #213 (CLAUDE.md), this one (agent docs). Docs archived:
`spec/rollout-vi-gate.md` and the vi-gate `next-session-prompt.md` → `spec/archive/`.

---

# Session Notes - 2026-08-04

## What We Accomplished ✅

### Content locale + search follow-ups (PR #206, merged)

All of `spec/search-followups.md` Part 2 plus Part 1 §1 and §2, in one branch — the pieces
only make sense together: surfacing a machine title without disclosure puts words in an
author's mouth, and trusting provider-side detection without `titleOriginal` can lose a good
match.

- **`User.localePreference`** + private `GET`/`PATCH /api/users/me/locale-preference`.
  Reports `null` (not `'en'`) when unset, unlike `themePreference` — the client's default is
  `navigator.language` and answering `'en'` would override it on every device.
- **Content-language picker** in the site nav, opened off a service subject so the user menu
  and the details-page disclosure both reach it with no component wiring.
- **`?lang=` + one shared title resolver** applied at the response boundary of the list,
  details, related-shelf and editor-open responses.
- **`titleOriginal`** in the text index (weight 4) — translating a title used to delete the
  author's own words from the index.
- **Provider-side detection pass** in `derive-search` for titles our detector can't place.
- **Declared `sourceLang`** on the save path.

### Decisions worth remembering

- **`blueprintsearch` is now a display source**, widening its "advisory for retrieval only"
  contract. Confirmed rather than overturned; reasoning and the rejected
  `titleTranslations`-on-the-document alternative are in `title-resolution-service.ts`.
- **The resolved title is `displayName`, never `name`.** Returning a translated value in a
  response's `name` field is the same mutation seen from the client — the editor stores it,
  the save dialog pre-fills from it, and the details page builds the download filename from
  it.
- **The picker is deliberately absent from the editor.** Selecting reloads the page (the
  locale is a request parameter), which would discard unsaved editor work.

### Gotchas found

- **`translateMany` short-circuits on `sourceLang == null && ASCII_ONLY`** — exactly the
  romanized-title candidate set. `forceProviderDetection` bypasses it; without that the pass
  makes zero provider calls and still reports success.
- **A long-lived local test DB keeps stale indexes** and Mongo won't redefine one in place.
  The symptom was a search test finding nothing, never an index error — CI (fresh mongo)
  never sees it. `__tests__/hooks.ts` now runs `syncIndexes()` and reports failures by model.

### Left for the next session

**Prod activation is blocking and not done**: `npm run migrate:up` then
`npm run derive-search`, in that order. See `agent/TODO.md`.

- **Tests**: backend 1022, frontend 1226 — all green.

---

# Session Notes - 2026-07-05

## What We Accomplished ✅

### Social features shipped to master (PRs #101, #103)

- **Likes** — atomic upvotes with `likeCount` cache and popular sort; migration
  `20260705000000_blueprint-like-count.js` backfills counts.
- **Auto-derived metadata** — `gameVersion` and `modded` now derived from blueprint content
  (`lib/src/blueprint/blueprint-analyzer.ts`); `multiplayerSafe` removed; save dialog fields
  read-only.
- **Profiles + follows + activity feed** — `/profile/:username` pages, follow/unfollow,
  follower/following counts, activity feed on browse; new `Follow` model with indexes
  (`20260705010000_add-follow-indexes.js`), `user-controller.ts`, `user-service.ts`.
- **Tests**: backend 275, frontend 547 (+2 skipped) — all green.

### Agent docs cleanup

Deleted `ASSESSMENT.md` (2023-era coverage audit; every item since done),
`CI_IMPROVEMENTS.md` (all 6 items complete incl. mongosh health check on mongo:8.0.23),
`PR_DESCRIPTION.md` (WorkOS in-app auth PR — merged). Trimmed `WORKOS_PLAN.md` to an
operational reference. Refreshed `TODO.md`.

---

# Session Notes - 2026-06-24

## What We Accomplished ✅

### Metadata loop closed — Work items A, B, C (branch `discover-home`)

Closed the gap where `gameVersion`/`category` existed on the schema but had no authoring path,
no read path, and no filter. The entire vertical now works end-to-end: shared enums
(`lib/src/blueprint/blueprint-metadata.ts`), blueprint model metadata fields, upload
validation (400 on unknown enum values), save-dialog authoring UI, browse-page filter panel
with URL-reflected facets, and card badges. Compound indexes
`{ deletedAt, gameVersion, category, createdAt }` now used by every filtered query.

**Tests**: backend 204 (+17), frontend 474 (+21). `npm run tsc` clean.

---

# Session Notes - 2026-06-22

## What We Accomplished ✅

### OniExtract2024 flat-icon migration — wrapped up (branch `export-aqua`)

- **Import pipeline**: `convert-export-2024.ts` (`npm run import:2024`) reads the 13-file
  export → `database-2024.json`, syncs `ui_image/` and `connection_sprites/` into both asset
  roots, validates. Backend loads the JSON; frontend fetches the derived zip.
- **Flat-icon render**: `OniItem.flatIconId` / `DrawPart.flatIconId`; `uiImageRect` places
  overhanging art, else stretch-to-footprint. 31 connectables render 16 per-state PNGs.
- **Legacy atlas pipeline removed**: all `generate-*` / `extract-export` / `add-info-icons`
  scripts and old `database*.json/.zip` + `repack_*.png` assets deleted.
- **Docs**: migration journals folded into `app/api/batch/convert-export-2024.md`.
- **Tests**: 187 backend + 453 frontend green.

---

# Session Notes - 2026-04-03

## What We Accomplished ✅

### Test Coverage Expansion (108 → 141 tests)

- Full auth coverage: registration validation, complete password-reset flow (token issue,
  expiry, reuse prevention); `emailService.ts` skips SMTP when `NODE_ENV=test`.
- Blueprint API coverage: get/list/upload/like/delete incl. auth, ownership, validation.

### Database Indexes Added

- **Blueprint**: `{ createdAt: -1 }`, `{ owner, createdAt }`, `{ owner, name }`
- **User**: `{ resetToken }`

### API Error Standardization

All error responses use JSON:API format via shared `apiError()` helper
(`app/api/utils/apiError.ts`); status codes corrected (400/403/404 instead of blanket 500).

### Phase 7: Zero-Warning Enforcement

Backend enforcement landed this session (`noUnusedLocals` etc. in `tsconfig.json` +
`lib/tsconfig.json`, `forbid-only`, console-failing Mocha root hook, explicit `npm run tsc`
CI step). Frontend strict enforcement was prematurely enabled, broke CI, and was reverted —
**later completed properly**: all flags (`strict`, `strictTemplates`, `noUnused*`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`) are now enabled in
`frontend/tsconfig.base.json` with a clean build.

## Decisions Made This Session

- **Error format**: JSON:API (`{ errors: [{ status, title }] }`) — RFC 7807 deemed overkill
- **Rate limiting**: Deferred to Cloudflare — no express-rate-limit needed
- **Security items** (account lockout, email verification, JWT hardening): not prioritized
