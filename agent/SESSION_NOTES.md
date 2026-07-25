# Session Notes - 2026-07-25

## What We Accomplished ✅

### DLC requirements step 2 — the `dlc=` filter (PR #178, merged)

- **API**: `GET /api/getblueprints?dlc=DLC2_ID,DLC3_ID` — `$in` membership like `rooms`,
  repeatable or comma-separated. Ids validated by *shape* (`/^[A-Z0-9_]{1,32}$/`, max 20),
  never against `DLC_LABELS`, so a pack that ships in an export before we have written its
  label stays filterable. Documents with no `requiredDlcs` never match (tested, not assumed).
- **Related shelf**: `gameVersion` equality → `requiredDlcs` set overlap, in its own commit
  so it can be reverted alone. Both-empty still scores — base-game-only is a shared property.
- **UI**: multi-select DLC facet on Discover (URL param `dlc`, CSV out, CSV-or-repeated in),
  labelled chips on card / details / save dialog, `dlcTooltip()` built on lib's `dlcLabel()`.
- **Review fix**: the save dialog seeded `requiredDlcs = []`, so an unloaded database made it
  claim "Base game". Now `string[] | null` — same absent-vs-empty distinction as the card.

**Outstanding operational step:** the prod backfill (`cd /bpni/build && npm run
derive-metadata`) has not run. Until it does the filter returns nothing — see TODO.md.

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
