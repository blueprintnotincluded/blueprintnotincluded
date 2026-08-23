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

**OniExtract2024 import (current pipeline):** after dropping a fresh export into
`export/` (`export/database/`, `export/ui_image/`, `export/connection_sprites/`),
run the single repeatable step:

- `npm run import:2024` - Regenerate `database-2024.json` into both asset roots
  (`assets/database/` + `frontend/src/assets/database/`), content-aware sync `ui_image/`
  and `connection_sprites/` into both roots, flatten `po_string.json` into the frontend's
  English game-string map (`frontend/src/assets/strings/strings.json` — the display names
  the build menu resolves element/building/category ids against), and print a validation
  report. Exits non-zero if the import is incomplete (missing icons, incomplete connection
  dirs, `po_string.json` absent, etc.).
- `npm run import:2024:dry-run` - Validate + report counts only; writes/copies nothing.
- The committed runtime DB artifact is the loose `database-2024.json` (readable diffs).
  The `database-2024.zip` (both roots) is a **gitignored** build derivative: the backend
  reads the JSON directly, the frontend regenerates the zip from it via `prebuild`/
  `prestart` (`frontend/scripts/build-database-zip.js`). The converter emits no `.zip`.
- Sprite sync rewrites a file only when it actually changed and prunes removed ones, so
  unchanged icons keep their mtime and git shows only real changes. The export is NOT
  byte-deterministic across game updates (Klei re-rasterizes untouched art), so a PNG
  that differs in bytes is additionally checked _perceptually_ (`pngVisuallyEqual`:
  alpha-premultiply → small Gaussian blur → count pixels still differing) and preserved
  when the pixels are visually identical. The blur is what distinguishes real redraws from
  sub-pixel re-rasterization jitter even on densely-textured sprites. Re-importing the same
  export is a near no-op.
- `ui_image_facade/` is intentionally skipped (unused by the app); one-line flip in
  `app/api/batch/convert-export-2024.ts` to enable.
- After import: restart `npm run dev` (backend reads `database-2024.json` at startup) and
  restart the frontend (`cd frontend && npm start`) so its `prestart` regenerates the zip.
  No lib rebuild needed for data/icon-only iterations.
- `convert:2024` is a kept alias for `import:2024`.

Export contract + converter behaviour: `app/api/batch/convert-export-2024.md`.

The legacy 2020/2023 atlas pipeline has been removed — the `generate-icons/white/groups/repack`,
`enhanced-extract-export`, `extract-export`, `test-canvas`, and `add-info-icons` batch scripts
and their `npm run generate*` / `seed` / `enhancedSeed` / `testCanvas` entries no longer exist.
Remaining batch utilities:

- `npm run fixHtmlLabels` - Fix HTML formatting in labels.
- `npm run derive-metadata` - Backfill `requiredDlcs`, `mods`, `modded` and `category` on all blueprint documents from stored building IDs. Use `--dry-run` flag (`npm run derive-metadata:dry-run`) to preview counts without writing. Both modes report the prefab ids found in blueprints but missing from `database-2024.json` — those ids drive `modded=true` **and** contribute no `dlcIds`, so each one is a blueprint silently reading as base game. `modded` is written in both directions (a false positive can be cleared), except that `hadUnknownBuildings: true` always wins — those blueprints had unknown buildings stripped at import, so re-derivation can't rediscover them. Note `Element` is an editor annotation synthesized by `OniItem.load`, not a database building; it must be added to any `knownIds` set built from `database-2024.json` or every annotated blueprint reads as modded. The retired `Info` id belongs in that set too — it no longer registers an `OniItem`, but pre-migration documents can still carry it. Add `--recategorize` (`npm run derive-metadata -- --recategorize`) to re-derive `category` for documents that already have one, overwriting user picks; needed whenever the scoring rules in `blueprint-analyzer` change, since the default only fills in nulls.
- `npm run derive-rooms` / `derive-rooms:dry-run` - Re-derive the `rooms` field on all non-deleted blueprints with the same detector the save path uses.
- `npm run derive-search` / `derive-search:dry-run` - Rebuild the `blueprintsearch` rows, then run two translation passes over the titles: confidently non-English ones through Google, and (unless `--skip-provider-detect`) conservative undetectable ASCII candidates through Gemini's romanized-Vietnamese gate first. Only explicit `not-vietnamese` results continue to Google's general provider detection; ambiguous/invalid results remain authored. Gemini batches are at most 12 titles / 720 characters, concurrency 1, zero retries. Dry-run constructs no Gemini client and reports exact title/document/character/batch/token/micro-USD ceilings. Rerunnable — fresh rows only get their ranking signals refreshed, already-translated rows are left alone, and accepted translations are cache reads. **Run `npm run migrate:up` first** whenever the text or translation-unit index has changed.
- **`--limit N` on both derive tasks** - A full pass loads every stored blueprint blob (~10 min on the live corpus), so diagnostic dry runs take `--limit N` (`npm run derive-metadata -- --dry-run --limit 100`). The capped run samples **randomly**, not the first N: natural order tracks insertion date and so does everything these reports measure, so a head sample would report the oldest blueprints' problems as the corpus average. Percentages from a sampled run extrapolate; the absolute counts don't. Shared helper: `app/api/batch/batch-sampling.ts`.
- `npm run avatars:smoke` / `avatars:seed-batch -- --count N` / `avatars:backfill[:dry-run]` - Gemini avatar pipeline (costs real money per generation; setup + rollout order in `agent/AVATARS.md`).
- `npm run backfill-previews` - Render preview images for all non-deleted blueprints (newest first) and store them durably in Mongo (`previewimages` collection). Skips blueprints whose durable rows are already fresh, so it's rerunnable/resumable. Use `--dry-run` (`npm run backfill-previews:dry-run`) to report the fresh/stale split without rendering or writing.
- **Running batch tasks in production:** the deploy image has no devDependencies or TS sources, but ships `package.json` + `scripts/batch.sh` into `/bpni/build`, so the same npm task names work there: `cd /bpni/build && npm run avatars:seed-batch -- --count 10` (likewise `derive-metadata`, `backfill-previews`, `migrate:up`, …). `batch.sh` dispatches to compiled `app/api/batch/<name>.js` in the image and `ts-node` in a dev checkout. Direct `node app/api/batch/<name>.js` also works. New prod-runnable batch tasks must go through `scripts/batch.sh`, and any files they read at runtime must land in `build/` (copy_assets.sh + a `COPY` in deploy.Dockerfile). Full checklist: README "Running batch tasks in production".

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
- Run a single spec via the `--include` glob: `npm test -- --include='**/login-page.component.spec.ts'`. Do NOT run `vitest`/`ng test` against a bare file path — globals and the Angular TestBed are wired by the builder setup file, so plain `vitest run <file>` fails with `describe is not defined`
- `npm run test:coverage` generates a text summary + lcov report
- CI runs `test:coverage` so every PR shows a coverage table in the job log
- Renderer (`DrawPixi`, PIXI) is always mocked in unit tests — never instantiate real PIXI in specs

## Current Status

- **Phase**: multilingual search + content locale plan is **fully shipped** (search plan
  phases 0–5, `spec/search-followups.md` Part 1 §1/§2/§4 and all of Part 2 including native-
  language rows). Retrieval now reads a viewer's content locale (`?lang=`) alongside the `en`
  pivot; open decision #1 in the search plan is resolved. Only the Part 1 §5 precision audit
  remains, and only because it's blocked on the prod activation below. Remaining plan items
  (IDF weighting, `.po` acquisition, near-duplicate clustering, phase 6 semantic retrieval) are
  each either explicitly deferred with a stated trigger or decided against — see
  `spec/multilingual-search-plan.md` §8. Asset pipeline is still OniExtract2024 flat-icon
  rendering.
- **Date**: 2026-08-04
- **Node.js**: 20.19.4 (via volta)
- **Stack**: TypeScript 5.9.3 strict (both trees) · Mongoose 8.24 · Express 5.2 · Canvas 3.2.3 · Angular 20 · PrimeNG 20 · ESLint 9 flat config · Prettier 3 (both trees) · husky 9 + lint-staged 16
- **Tests**: ✅ Backend 1033 passing (Mocha 11 + Chai 4; a few DB-heavy API specs time out under
  load locally and pass on a clean run) · Frontend 1226 passing (Vitest/jsdom)
- **⚠️ Pending prod activation — blocking**: `npm run migrate:up` then `npm run derive-search`
  (in that order — see "Search (blueprintsearch)"). Until both run, no row has a
  `titleOriginal`, romanized non-English titles are still untranslated, and the Part 1 §5
  precision audit (search-followups.md) has nothing to measure. Run `derive-search:dry-run`
  first and report the candidate counts before spending — see search-followups.md's "Prod
  activation" note for exact commands and expected output.
- **Build**: ✅ `npm run tsc` clean · `npm run build` clean
- **Lint**: `cd frontend && npm run lint` (ESLint 9 flat config, `frontend/eslint.config.js`); backend has no ESLint yet — Prettier only

### Asset rendering: OniExtract2024 flat icons

Rendering uses the 2024 flat-icon model, not the retired multi-sprite atlas. Contract and
converter details: `app/api/batch/convert-export-2024.md`.

- **Types**: `lib/src/b-export/b-export-2024.ts` — raw 2024 export shapes (13 files).
- **Import**: `app/api/batch/convert-export-2024.ts` (`npm run import:2024`) → consolidated
  `database-2024.json` written to both asset roots (committed; the `.zip` is a gitignored
  build derivative); content-aware syncs `ui_image/` (1,241 flat PNGs) and
  `connection_sprites/` into both asset roots.
- **Render**: each building is one flat icon — `OniItem.flatIconId`, `DrawPart.flatIconId`,
  no UV slice. `uiImageRect` (when present) places overhanging art relative to the
  footprint; otherwise the icon is stretched to the footprint.
- **Connectables** (31 prefabs): render `connection_sprites/{prefabId}/{bitmask}.png` per
  4-bit neighbour mask (left=1, right=2, up=4, down=8). `OniItem.connectionSprites` is
  derived from dir presence; `BlueprintItem` builds 16 tagged flat-icon draw-parts;
  per-building `connectionScale` is measured from `15.png` at import time. The build/select
  menu keeps the single canonical icon (`iconUrl`).
- **Utility ports** (275/449 buildings): `BBuildingDef2024.utilities[]` carries each
  input/output port as `{offset, type, isSecondary}`. The U59 export emits `type` as the
  `ConnectionType` enum _name_ (string); the converter maps it to the int via
  `CONNECTION_TYPE_BY_NAME`. Offsets are pre-rotation/y-up/footprint-relative and already
  match the website's internal convention (no transform). `BlueprintItem.drawPixiUtility`
  draws the markers per overlay; the 8 indicator sprites (`input`/`output`/`logicInput`…)
  are registered from the export's own `ui_image/<name>.png` flats (copied into
  `frontend/src/assets/images/` at import) — they no longer slice the legacy atlas pages.
  Details: `app/api/batch/convert-export-2024.md`.
- **Loaders**: backend reads `database-2024.json` directly; frontend fetches
  `database-2024.zip` (regenerated from the committed JSON by its `prebuild`/`prestart`).
- **DLC data**: each building record now includes `dlcIds: string[]` (e.g. `['EXPANSION1_ID']`
  for Spaced Out buildings). The converter (`import:2024`) populates this from the raw export's
  `kPrefabID.requiredDlcIds`. Used by `BlueprintAnalyzer` to derive metadata.

### Keyboard shortcuts

Editor input goes through an action layer, never raw key comparisons.

- **`frontend/src/app/module-blueprint/keybindings/shortcut-actions.ts`** — the catalogue of
  rebindable actions (id, category, label, default chords). Defaults mirror Oxygen Not
  Included's own controls where the game has an equivalent action; website-only actions take
  keys the game leaves free. Adding a shortcut = one entry here + one handler registration.
- **`keybindings/key-chord.ts`** — chord model over `KeyboardEvent.code` (physical key, like
  the game), with pure parse/serialize/format helpers. Serialized modifier order is fixed
  (`Ctrl+Alt+Shift+Meta+Code`); a spec fails on any default written out of order.
- **`services/keybinding.service.ts`** — resolves chord → action, detects conflicts, and
  persists **only the user's diff from the defaults** (`localStorage['bpni-keybindings-v1']`)
  so future default changes still reach existing users.
- **`services/keyboard-shortcut.service.ts`** — dispatcher. Components call
  `register(actionId, handler)` and never see a key. Handlers are LIFO (a transient owner
  shadows the editor-wide one) and returning `false` declines an action that doesn't apply
  right now. Text inputs are guarded centrally here.
- **Tools** implement `handleShortcut(action): boolean`, not `keyDown(keyCode)`.
- **UI**: `components/dialogs/dialog-keybindings/` — Edit ▸ Keyboard shortcuts, or `Shift+/`.

### Terrain annotations (geysers, vents, volcanoes)

Natural map features placed on a blueprint as _annotations_ — "this pump array sits on a
chlorine vent". Dupes cannot build them, so they are excluded from every build-related model:
no `BlueprintItem`, no material cost, no ingredient totals, no build order, and never an entry
in the exported `buildings` array (a geyser written as a building resolves to a null
`BuildingDef` in the BlueprintsV2 mod, which then rejects the whole config).

- **Catalogue** — `terrainFeatures` in `database-2024.json`, generated by `npm run import:2024`
  from the game's own export: 27 `GeyserGeneric_*` prefabs from `geyser.json`, plus the
  `GeyserFeature`-tagged entities and `OilWell` from `entities.json` (31 total). Each carries
  the real ONI prefab id, a display name (markup already stripped — unlike buildings/elements
  these are not re-resolved through `GameStringService`), the real footprint, and `dlcIds`.
  The export already ships one flat icon per prefab, so art needs no separate sourcing.
  Loaded via `TerrainFeature.load()` alongside `BuildableElement`/`OniItem`.
- **Icon placement** — each entry also carries `uiImageRect`, the same cells/footprint-relative
  placement rect buildings use. Terrain icons are tight-cropped ~200 px/cell renders (a 3x3
  volcano's PNG is 693x725), so stretching one to the footprint both squashes its aspect and
  crops the plume overhang the render was framed to include. The rects arrive via
  `export/ui_image_rects.json` (export **root**, not `database/`) because geysers are not
  `BuildingDef`s and so have no `building.json` entry to carry one; that file covers buildings
  redundantly, but they keep reading their own. Placement is computed by `terrainIconPlacement`
  in `drawing/draw-terrain-overlay.ts`, shared with `TerrainTool`'s cursor ghost so the icon
  does not jump between hover and click; an id with no rect falls back to the inset stretch.
  The importer fails on any rect whose `w:h` disagrees with its PNG's pixel aspect by ≥2%, and
  a test asserts the same over the committed database — see `convert-export-2024.md`.
- **Storage** — the mod's v6.2.0 top-level `metadata` field, which deserializes into a C#
  `Dictionary<string, string>`: **flat, string-valued only**. Any other JSON token type is
  silently dropped on the next in-game save (`"count": 3` dies, `"count": "3"` lives). So the
  whole payload is one JSON-encoded _string_ under `bni/terrain`
  (`lib/src/blueprint/terrain-metadata.ts`), namespaced because the mod does not namespace its
  own keys and reserves the right to add some. Foreign keys are read whole, mutated narrowly,
  and written whole back — including across the server-side MDB hop
  (`Blueprint.foreignMetadata` / `MdbBlueprint.foreignMetadata`).
- **v1 payload** — `{v, features:[{id, x, y}]}`. Position and type only; free text belongs in a
  world note, which is already first-class blueprint content. Unknown per-feature keys
  round-trip, so a newer client's extra fields survive an older client's re-save. `x`/`y` are
  the **bottom-left** anchor cell, in the same space as `digcommands`. Absent/malformed/newer-`v`
  payloads decode to zero features and log — never throw, never block loading.
- **The coordinate hazard** — the mod's `SanitizePositions()` re-origins buildings, digs, notes
  and plans when either minimum is negative, but does **not** touch `metadata`. So
  `toBniBlueprint` mirrors that arithmetic itself (`lib/src/blueprint/bpv2-sanitize.ts`) and
  shifts the annotations by the identical offset, making the mod's own pass a guaranteed no-op
  on every file we write. Note the mod shifts _both_ axes once _either_ is negative, so a
  positive minY moves the blueprint down — an export that disagreed would leave the mod
  something to do, which is exactly what desyncs the markers.
  The **import** side deliberately does not re-origin: terrain shares a coordinate space with
  the buildings of the same file, and the importer reads those verbatim too, so shifting
  annotations alone is the one thing that would break alignment. The desync is created on
  write and is fixed on write.
- **Editor** — `ToolType.terrain` + `TerrainTool` (`common/tools/terrain-tool.ts`), palette in
  `components/side-bar/terrain-tool/`, selection/visibility in
  `services/terrain-annotation.service.ts`, rendering in `drawing/draw-terrain-overlay.ts`
  (translucent icon inside a dashed footprint outline — context, not construction).
  Hit-testing is area-based, since footprints run 2x2 to 4x4. The "show terrain features"
  toggle is view state only: it never reaches stored data, and never applies to export or
  thumbnail canvases.
- **Delete is the ordinary editor delete** (`ShortcutAction.editDelete`), not a panel button:
  the canvas registers a handler above the tool layer that removes the selected annotation and
  **declines when none is selected**, so the key falls straight through to `SelectTool`'s
  building delete. For that to be unambiguous the two selections are mutually exclusive —
  clicking an annotation calls `selectTool.deselectAll()`, and the canvas subscribes to
  `subscribeSelectionChanged` to clear the annotation whenever `selectTool.hasSelection`
  becomes true (a box-drag selection produces no click, so the click path alone can't see it).
- **Neutronium base** — placing an annotation seeds the row of Neutronium every geyser is
  anchored on in game: height 1, as wide as the footprint, in the row directly beneath the
  anchor cell (`neutroniumBaseCells`). The real deposit is often a cell or two wider, but by
  how much depends on the world seed, so only the subset that is always present is drawn.
  Each cell is an **element world note** (`BlueprintNoteData.NoteType.Element`, i.e. `type: 1`
  carrying `id`/`mass`/`temp`), not a website-only element cell: the mod already has a
  first-class way to say "this cell holds this material", so the base survives the trip back
  into the game instead of being dropped on export, and it costs no new model — world notes
  already render, export, undo and import. It also carries no explanatory text, because the
  mod writes only id/mass/temp for an element note and discards title/text/tint.
  _Seeded, not owned_ — the user then edits or deletes them with the note tool, so deleting
  the annotation leaves them alone rather than discarding their edits, and a cell that already
  holds a note is never overwritten. The annotation and its base are one
  `emitBlueprintChanged`, hence one undo step.
- **Solid element cells** — `BlueprintItemElement` previously rendered only gas/liquid/vacuum;
  solids now render too (Base overlay only, tinted `element_back`, at `ZIndex.Backwall` so a
  building placed on annotated ground is never covered by it). The cell picker gained an
  opt-in **Solid** checkbox, off by default so the existing gas/liquid list is unchanged.
  Neutronium is `Unobtanium` (`NEUTRONIUM_ELEMENT_ID`); it is the one element whose exported
  `color` (white) and `uiColor` (magenta) are both sentinels — the game never renders it as a
  material — so it gets a render-time `NEUTRONIUM_DISPLAY_COLOR` (`#0e0e0e`, the near-black
  the game's own tile reads as), with the database left as the export wrote it. The override
  applies wherever Neutronium is drawn: element cells _and_ the element-note badges the
  terrain tool seeds (`noteBadgeColor`). This lets the user draw or extend a base by hand.
- **Active tile / area of effect** — a feature acts on exactly ONE cell, not on its whole
  footprint, and the cell differs by kind: a **volcano** erupts from the middle of its 3x3
  (`1,1`), a **geyser or vent** from the **left** of its footprint (`0,1`). The split comes
  from the game's own `geyserType.shape` — 2 = volcano, 0 = gas vent (2x4), 1 = liquid geyser
  (4x2) — so it is data, not name matching. Prefabs outside `geyser.json` (Thermal Gas
  Fissure, Oil Reservoir, Tidal Spring, NiobiumGeyser) carry no shape and fall back to the
  volcano cell. Current split: 18 geyser-offset, 13 volcano-offset.
  Selecting a feature highlights that single cell, the way a selected building shows its
  `areasOfEffect`; the footprint outline is the feature's _body_, not its effect. Offsets are
  emitted per feature by the importer (`terrainActiveTile()` → `BTerrainFeature.activeTile`)
  rather than derived at render time, so an exception is a data fix.
  `TerrainFeature.importFrom` clamps into the footprint; an unknown id falls back to its own
  anchor. Drawn on a second Graphics layer kept above the icons — unlike a building's AoE it
  sits _inside_ the art, so underneath it would be invisible. Magenta because it overprints
  grey rock, blue ice and orange lava alike (a warm marker vanished into the volcano sprite).
  **Gotcha:** the frontend reads the gitignored `database-2024.zip`, regenerated by
  `prestart`. Starting the dev server with `npx ng serve` instead of `npm start` skips that,
  so catalogue edits silently do not reach the browser — run
  `node frontend/scripts/build-database-zip.js` or use `npm start`.
- **Unknown ids survive**: single-cell footprint, placeholder glyph, raw id shown in the panel.
- **Known gap (shared with Planning Tool shapes)**: the durable server-side preview
  (`app/api/services/preview-render-worker.ts`) draws `blueprintItems` and world notes, but
  not terrain, so geysers do not appear on blueprint cards/details previews — only on the live
  canvas and the client-side thumbnail/export snapshots. It also rejects a blueprint with zero
  `blueprintItems`, so an annotation-only blueprint gets no stored preview.

### World notes (annotations)

The mod's world notes are the **only** annotation model. The website's own `Info` type — a
pseudo-building with a title, body and coloured badge — is retired: it could not be written to
a .blueprint file at all, so `toBniBlueprint` skipped it and every website annotation vanished
on download. `Info` now survives as an _input_ format only.

- **Conversion** — `lib/src/blueprint/note-conversion.ts` (`infoBuildingToWorldNote`), applied
  in `Blueprint.importFromMdb`. Badge colour → `tinthex`, the twelve `InfoIcon`s → the mod's
  `note_info`/`note_warn`/`note_question`/`note_num_N` symbols, both written explicitly because
  the two models' defaults differ. `frontColor` is dropped — a marker is one colour.
  Stored documents were converted by `migrations/20260730000000_info-items-to-world-notes.js`;
  converting on read means a document is correct either way, and any re-save converges it.
- **Rendering** — which sprite, what colour, how big: `lib/src/drawing/note-markers.ts`, shared
  by the editor overlay (`drawing/draw-notes-overlay.ts`), the client-side export/thumbnail
  snapshots, and the server preview worker. The overlay keeps only the per-frame concerns
  (texture pooling, selection ring). Node PIXI needs a whole-image `Texture`, not a
  `BaseTexture` — `Sprite.from` throws on the latter.
- **Editing** — `NotesTool` + `components/note-edit-panel/`. There is no other annotation UI.

### Search (blueprintsearch) & user-content translation

`spec/multilingual-search-plan.md` phases 0–5 (all shipped) + `spec/search-followups.md`
Part 1 §1/§2.

- **Search documents** — `blueprintsearch` collection (`app/api/models/blueprint-search.ts`),
  one row per `(blueprintId, lang)`; every blueprint has an `en` row (the pivot invariant).
  Holds title/`titleOriginal`/description/`terms[]` (display names) under the collection's
  single text index (title 10 / titleOriginal 4 / terms 4 / description 1,
  `language_override: 'textLang'` — ISO `lang` stays an
  open set, `textLang` maps unsupported stemmers to `none`), `termIds[]` (prefab + room ids,
  language-independent), and denormalized ranking signals. Rows are **derived and disposable**
  (`npm run derive-search[:dry-run]`, `--limit N`); they are advisory for retrieval only — the
  final page fetch re-applies the authoritative filter on `blueprints`, so a stale row can cost
  recall but never leak a draft/deleted doc. Save path upserts the row (awaited, non-fatal);
  delete/publish/rating-recompute patch status/signals fire-and-forget. **The row is now also a
  display source** — see "Content locale" below for why that widening is judged safe.
- **Retrieval** (`app/api/services/search-service.ts`) — normalize → term-resolve → lexical
  (`$text`) + structural (`termIds` ∩ resolved ids) → RRF fuse → rank. Pure pieces live in
  `lib/src/search/` (`query-normalize`, `term-resolve`, `rrf`, `ranking` — the ranking spec
  asserts ordering properties, not scores). Term dictionary is built lazily from the loaded
  `OniItem` display names + room names + `assets/search-aliases.json` (hand-maintained jargon:
  `spom`, `aquatuner`, …; validate ids against the database when editing).
  `lexicalRetrieval` widens its `$in` to `[viewerLang, 'en']` (`SearchOptions.viewerLang`,
  threaded from the same `?lang=` the content-locale picker introduced) rather than
  hard-coding `'en'` — search-followups.md Part 1 §4. `structuralRetrieval` deliberately stays
  `en`-only: `termIds` are language-independent and identical across a blueprint's rows, so
  widening it would only return a duplicate row for no new signal. Rows are deduped to one per
  blueprint before fusion — `fuseRanks` has no id-uniqueness precondition on its input arrays,
  so a duplicate id would otherwise double-add its RRF score.
- **Native-language rows** (§2.9) — `deriveNativeSearchRow`/`upsertSearchRow`
  (`search-index-service.ts`) write a second row per blueprint, `lang: blueprint.sourceLang`,
  `origin: 'authored'`, holding the title/description verbatim (never `titleOriginal` — this
  row IS the original). Kept alongside `titleOriginal` rather than replacing it: `titleOriginal`
  is the language-independent floor (works with no declared/detected `sourceLang` at all);
  the native row is the precision upgrade once a language is known, since it gets Mongo's real
  per-language stemmer via `language_override`, which a field on an `en`-stemmed row cannot
  provide. Stale rows (title re-authored in a different language) are pruned on the next save,
  scoped to `origin: 'authored'` so a phase-5 accreted `origin: 'machine'` row in some other
  language is never touched.
- **Endpoint integration** — `filterName` on `getblueprints`/`blueprintfacets` resolves through
  the search service to a ranked id list (`_id $in`); under the default `recent` sort the page
  is a rank-ordered slice (offset pagination — the client sends `skip` and drops the
  `olderthan` cursor whenever a name search is active), while explicit count sorts keep their
  own order with search as a filter. Kill switch `SEARCH_V2_ENABLED=false` reverts to the
  legacy escaped-regex substring match, which also remains the automatic fallback if the
  search layer errors.
- **Translation cache** — `translationunits` (`app/api/models/translation-unit.ts`), keyed
  `{textHash, sourceLang('auto' when unknown), targetLang, mode}` — by **text**, never by document:
  identical text is billed once corpus-wide. `mode:'standard'` preserves Google/human behavior;
  accepted Gemini romanized-Vietnamese titles use `mode:'vi-romanized-title-v1'`, source `vi`,
  target `en`, plus immutable prompt/model, restored Vietnamese, and token provenance.
  Ambiguous/negative/invalid Gemini answers are never cached. Google character-budget behavior
  is unchanged; Gemini maximum/observed micro-USD and token accounting shares the site-month row
  in `translation-budget.ts`.
- **Language detection** — `detectLanguage(text, {prior}) → {lang, confidence:
'high'|'prior'|'none'}` (`language-detection-service.ts`): statistical margin for ≥20 chars;
  short texts need a stronger margin AND a non-ASCII signal, else they fall to the caller's
  prior (recorded as `'prior'` so callers can decide whether to spend money on it).
  `detectLanguageCode()` is the high-confidence-only convenience the save paths use.
- **Translate UI gating** — `BlueprintDetailsResponse.translationEnabled` (server
  `isConfigured()`); the details page and comment section render no Translate affordance
  without it, so an unconfigured prod never shows a button that 503s.
- **Duplicate collapse** (phase 2) — measured on a prod restore: 651 groups of byte-identical
  content cover **47% of live blueprints**, the largest being 90 documents from 86 distinct
  owners (the pre-fork "save someone else's build into my account" workaround). Membership is
  a content hash — `contentClusterKey` in `lib/src/search/cluster-key.ts` over sorted
  `id:x:y:orientation` tuples translated to the origin — stored as `clusterKey` on the search
  row. Rows sharing a key ARE the cluster: no cluster collection, no stored canonical, no
  global pass, so a save derives its own membership. The plan's `clusterId: ObjectId` and its
  second signal (multiset Jaccard for near-duplicates) are deliberately not built; the latter
  can't be computed per document. `clusterKey` is part of the row's `sourceHash`, so
  `npm run derive-search` re-derives every pre-phase-2 row.
  Collapse itself is **read-time and view-only** (`collapseClusters`): it runs after the
  authoritative visibility filter, so a deleted or draft canonical can never suppress a
  visible copy, and it applies under **every** sort a search can use — the default sort is
  trending, so a relevance-only collapse would never fire in the UI. The canonical is elected
  by engagement, falling back to earliest `createdAt` (the probable original). Nothing is
  deleted or hidden: every copy keeps its URL and its owner's profile listing. `collapse=false`
  opts out (`?collapse=` on `getblueprints`, round-tripped through the Discover URL; the
  "Group identical copies" toggle appears only while a search is active, and the card shows a
  `+N copies` chip). **Facet counts never collapse** — a category count describes the corpus,
  not the view, so the sidebar can legitimately read 4 where the list shows 1.
- **Title translation pivot** (phase 3b) — `sourceLang` on `Blueprint` is derived from `name`,
  not `description` (titles are the corpus; descriptions are 22 documents site-wide), using
  `detectLanguage`'s locale prior — the author's `Accept-Language` header, the closest thing
  the backend has to "UI locale" since the frontend's four-locale build is a static path
  choice never sent to the API. A confidently non-English title (`detectLanguageCode`, no
  prior — deliberately stricter than the stored `sourceLang`, which may be only a prior-based
  guess) is machine-translated into the blueprint's existing `en` `blueprintsearch` row
  (`search-index-service.ts`'s `deriveSearchRowWithTranslation`/`syncMachineTitle`): the row's
  `lang` stays `'en'` — that's still the pivot invariant structural retrieval depends on — only
  `title`/`origin` flip to `'machine'`. Fired fire-and-forget from the save path (a provider
  call can take 15s) and via `npm run derive-search`'s second pass for the backfill, which
  batches by **unique title text**, not by document, so N duplicate titles cost one
  translation call. Verified against the real Google provider: a Vietnamese title saved
  through the live API produced `sourceLang: 'vi'` and a `blueprintsearch` row with
  `origin: 'machine'`, and an English query then found it.
- **`titleOriginal`** (`spec/search-followups.md` Part 1 §1) — translating a title used to
  _replace_ it, deleting the author's own words from the index: `Cozinha estrategia em choque`
  became findable by "strategic cooking" and no longer by itself. Worst exactly where query
  translation also fails (romanized text neither end detects), so both directions broke at once.
  The field holds the authored text whenever `origin` is `'machine'` and is **null while
  `authored`**, where it would only duplicate `title` and double its index weight. Weighted 4,
  not 10 — at `title`'s weight a translated row competes with itself. Derived wholesale, never
  appended, so it cannot accumulate (the objection that ruled out `terms[]`).
  Adding it to the text index needs `migrations/20260804000000_search-title-original.js`:
  Mongo won't alter an index in place and Mongoose's autoIndex hits IndexOptionsConflict, which
  surfaces only as a logged error. **Deploy order: migrate, then `npm run derive-search`.**
  The backfill also fills the field on rows an earlier run already translated — those rows are
  _fresh_, so they never reach full re-derivation, and their `sourceHash` pins them to the
  current `blueprint.name`, making the authored text recoverable exactly with no provider call.
- **Provider-side detection** (`spec/search-followups.md` Part 1 §2) — `derive-search`'s **second
  translation pass**, for titles `detectLanguageCode` can't place at all: short, romanized or
  diacritic-stripped non-English (`Dien phan full`). Those clear neither detection gate, so
  phase 3b never sees them and no amount of re-running it will. Candidates are rows still
  `origin: 'authored'` whose tokens the term dictionary does **not** fully resolve (an
  all-game-nouns title is already findable structurally — nothing to buy). **The trap:**
  `translateMany` short-circuits on `sourceLang == null && ASCII_ONLY`, which is exactly this
  candidate set, so the input carries `forceProviderDetection: true` to bypass it; without that
  the pass makes no provider call and still reports success. A result is accepted only when the
  provider reports a non-`en` source **and** changed the text. On by default;
  `--skip-provider-detect` opts out. Re-runs are cache reads (`translationunits` is keyed by
  text hash), so it is idempotent and near-free after the first.
- **Declared source language** (`spec/search-followups.md` §2.6) — `saveBlueprint` prefers the
  author's stored `localePreference` over `Accept-Language` as the detection prior, and passes
  it to `syncMachineTitle`. On that path `confidence: 'prior'` **is** trusted, deliberately
  reversing the rule phase 3b set: same mechanism, different evidence — a browser header is a
  default nobody chose, a picker setting is the user's own statement. Guards keep a
  misdeclaration cheap: the provider must report non-`en`, and a provider that returns the input
  unchanged never marks the row `'machine'` (which would claim a translation that isn't there
  and index the same string twice).
- **Decided not to build** (`spec/multilingual-search-plan.md` §8, 2026-08-04): IDF weighting
  for structural matches (needs a new maintained per-`termId` document-frequency table for an
  unmeasured payoff) and near-duplicate clustering + its fork-migration offer (needs a global
  pass; the offer is an unrequested product feature). Phase 6 semantic retrieval stays gated on
  `searchqueries` telemetry, re-checked 2026-08-04 and still nothing to justify starting — the
  trigger number is written into the plan's §4.5. `.po` acquisition is scoped but not decided —
  it needs real prod `sourceLang`/`searchqueries` traffic the still-pending activation would
  generate.

### Content locale (what language you read blueprints in)

`spec/search-followups.md` Part 2. **Not** UI localization — the chrome stays English for
everyone (see "UI localization state"), so this routes no bundles and prefixes no paths.

- **The rule** (§2.5), one shared implementation in `lib/src/blueprint/content-locale.ts`'s
  `resolveTitle`: authored-in-your-language → a translation into your language → the English
  translation → the authored title. The last step is what lets this ship ahead of any backfill:
  it can never produce a blank title.
- **Applied at the response boundary only** — `app/api/services/title-resolution-service.ts`,
  used by the list, details, related-shelf and editor-open responses. One query per page;
  any failure yields authored titles for everything. Inlining the rule per endpoint is how a
  card and its details page end up disagreeing about a blueprint's name.
- **`Blueprint.name` is never mutated and never changes meaning.** The resolved title rides in
  a separate `displayName` (+`nameTranslated`/`nameSourceLang`), so the `{owner,name}` duplicate
  check, download filenames and the editor's save path keep reading authored text.
  Editor-open resolves for chrome only — the editor stores `name` and its save dialog pre-fills
  from it, so translating that field would rewrite the author's title on their next save.
- **`?lang=` is an explicit query param, never `Accept-Language`**: these responses are
  Cloudflare-cached and a param keys cleanly where `Vary: Accept-Language` fragments the cache
  per browser. The client omits it entirely for English, so the ordinary browse URL is
  unchanged. Facet counts take no `lang` — they return no titles.
- **Reading display titles from `blueprintsearch` widens its contract** from "advisory for
  retrieval only". Confirmed, not overturned, on three grounds: the chain always terminates at
  `Blueprint.name` so a lost row degrades to authored text; machine titles rebuild for free from
  the `translationunits` text-hash cache; and rows stay advisory for _visibility_ because the
  authoritative filter still runs against `blueprints`. The rejected alternative was a
  `titleTranslations` map on the blueprint document — more obviously correct, but a second write
  path and a migration for data that is already derivable.
- **`User.localePreference`** (base ISO tag) + `GET`/`PATCH /api/users/me/locale-preference`,
  mirroring `themePreference`/`dlcPreferences`: private, never in `ProfileResponse`, absent
  means "never chosen". It reports `null` rather than `'en'` when unset, unlike
  `themePreference` — the client's own default is `navigator.language`, and answering `'en'`
  would override that on every device. The language set is **open** (shape-validated only): a
  user may declare a language we never translate _into_.
- **Picker** — `components/dialogs/dialog-content-language/`, mounted in the site nav and opened
  off `ContentLocaleService.openRequests$`, so the user-menu entry and the ambient entry point
  on the details page both reach it with no component wiring. Three states kept distinct:
  declared (localStorage + account), guessed (`navigator.language`, **never persisted** — a
  default that writes itself is indistinguishable from a choice, which would ruin the §2.10
  "who reads in what language" measurement), and English. Login adopts a local declaration into
  an account that has none; a _failed_ lookup is explicitly not "the account has none", or one
  flaky GET would overwrite a preference set elsewhere. Selecting reloads the page — the locale
  is a request parameter, so everything on screen was fetched under the old one.
- **Disclosure is mandatory and ships with the display** (§2.7): cards carry a quiet
  `pi-language` glyph whose tooltip holds the author's original; the details page states the
  fact, shows the original, and links to the picker. Machine output is never presented as the
  author's own words.

### Blueprint titles are Unicode

`Blueprint.name` was `/^[a-zA-Z0-9_ -]+$/`, which 400'd every non-English title at save. The
policy is now one shared module, `lib/src/blueprint/blueprint-name.ts`, used by the save
dialog (`blueprint-name-validation.directive.ts`), the upload endpoint and the Mongoose
schema — three surfaces that must not be able to disagree, since the failure mode is a form
that accepts what the server rejects.

- **Allowed**: every script, punctuation, emoji. **Rejected**: control characters, `\p{Cf}`
  format characters (bidi overrides and the rest) _except_ ZWNJ/ZWJ, unassigned/private-use/
  surrogate code points, runs of more than 4 combining marks, and Latin mixed with Cyrillic or
  Greek **inside one word** — the "Rоdriguez" homoglyph spoof. The confusable rule is per-word
  and only those scripts on purpose: mixing across words is ordinary (`Ферма SPOM v2`,
  `SPOM 电解 v3`), and a broader UTS #39 restriction would reject the very titles this exists
  to allow. The endpoint returns the specific rule broken; the dialog renders a translated
  message per `reason` (never the policy's English string).
- **`normalizeBlueprintName`** (NFC + whitespace collapsed to U+0020 + trim) runs at ingress
  and only there. It is load-bearing for the `{owner, name}` duplicate check, which is an
  exact string match: without it, a title typed on macOS (decomposed) and on Windows
  (composed) are two documents with identical-looking names and the author cannot overwrite
  their own blueprint from their other machine. The schema validator
  (`isCanonicalBlueprintName`) demands the already-normalized form rather than normalizing
  again, so a non-canonical name reaching a model write fails instead of being silently
  repaired. **Not case-folded** — the check has always been case-sensitive and folding it
  would newly collide existing ASCII titles. Length stays 60 UTF-16 code units, the unit
  `maxlength` counts.
- **Download filenames**: `attachmentDisposition` (`app/api/utils/content-disposition.ts`)
  emits RFC 6266's pair — an ASCII fallback plus `filename*=UTF-8''` — because an HTTP header
  is ISO-8859-1 and a title containing `"` would otherwise escape the quoted string. The
  client-side path uses `sanitize-filename`, which already preserves non-ASCII.
- Search needs no special handling: `normalizeText` already applies NFC and keeps non-Latin
  letters, and search rows are derived on save (covered end-to-end in `search.test.ts`).

### Blueprint metadata auto-derivation

`requiredDlcs`, `gameVersion` and `modded` are derived deterministically from the blueprint
content — users no longer set these manually. `multiplayerSafe` has been removed entirely.

- **`lib/src/blueprint/blueprint-analyzer.ts`** — pure functions (TDD-covered):
  - `deriveRequiredDlcs(buildingDlcIds: string[][]): string[]` — the union of every placed
    building's raw Klei DLC ids, deduped and sorted; `[]` = base game only. This is the
    current model; `deriveGameVersion` below is retained only until the frontend stops
    importing it (step 4 of `spec/dlc-requirements-plan.md`).
  - `deriveGameVersion(buildingDlcIds: string[][]): GameVersion` — **superseded.** Collapses
    the set to the highest-priority DLC found, so it can't express "needs Frosty _and_
    Bionic", and its `DLC5_ID`→bionicBooster mapping is wrong (DLC5 is the Aquatic pack).
  - `deriveModded(prefabIds: string[], knownIds: Set<string>): boolean` — true if any ID is absent
    from the loaded database
- **`lib/src/blueprint/dlc.ts`** — `DLC_LABELS`/`dlcLabel(id)`, the one place raw ids become
  display names (game strings `STRINGS.UI.<id>.NAME`); unknown ids fall back to the raw id.
  Stored data is always raw ids, never labels. A contract test fails if the export ships a
  DLC id with no label.
- **`Blueprint.requiredDlcs`** — server-derived on every save, fork and version restore
  (`app/api/services/dlc-derivation-service.ts`), never client-supplied; returned in the
  list/details/editor-open responses. Absent on documents predating the field until the
  backfill runs.
- **`Blueprint.hadUnknownBuildings`** — set during `importFromBni`/`importFromMdb` when a building
  ID is not found; read by the save dialog to detect mods stripped during import.
- **`?dlc=` filter** — `GET /api/getblueprints?dlc=DLC2_ID,DLC3_ID` returns blueprints requiring
  ANY of those packs (`$in`, like `rooms`; repeatable or comma-separated). Ids are validated by
  shape (`DLC_ID_PATTERN` / `MAX_DLC_FILTER_IDS` in `lib/src/blueprint/dlc.ts`, max 20), never
  against `DLC_LABELS` — a pack that ships in an export before we've written its label must
  still be filterable. Docs with no `requiredDlcs` never match.
- **`?excludeDlc=` filter** — the complement: `requiredDlcs: { $nin: [...] }`, same shape
  validation, composes with `dlc=`/`category=`. This replaced the plan's `owned=` subset idea —
  "I don't want Bionic blueprints" is more useful and more expressive than declaring what you
  own. Base-game (`[]`) and never-derived docs both survive exclusion (conservative: absence of
  DLC info is never treated as needing the excluded pack). A `$nin` on `requiredDlcs` gets no
  help from the field's indexes (can't produce a bounded range, so the planner keeps the
  `createdAt`-sorted index and applies the exclusion as a per-doc FETCH filter) — checked with
  `explain()`, not a collscan, just no extra narrowing.
- **DLC exclusion preference** — `dlcPreferences.excludedDlcs` on `User` (raw ids, `default:
[]`), read/written via `GET`/`PATCH /api/users/me/dlc-preferences`. Applied automatically on
  Discover load for a logged-in user _only_ when the URL has no explicit `excludeDlc` param;
  written back only on real interaction (toggle/clear), never merely from loading it, never for
  a logged-out visitor. Private account data — never in `ProfileResponse` or any other
  user-facing payload.
- **Display** — the blueprint card and details page render one linked chip per required DLC
  (`dlcLabel()`, `dlcTooltip()` in `utils/chip-tooltip.ts`); `[]` renders "Base game", while an
  absent set renders nothing. The Discover sidebar has two DLC facet groups — "show only" and
  "hide" — each multi-select and round-tripping through its own URL param (`dlc` / `excludeDlc`);
  a pack can't be in both, selecting it in one clears it from the other. Exclusion chips use the
  danger accent (`exclude: true` on `ActiveFilterChip`) so the two read as opposite intents.
- **Save dialog** — the DLC requirement set and `modded` are read-only, derived from blueprint
  content on open (`gameVersion` is still derived and submitted, but no longer displayed).
  `researchTier` is hidden (no tech-tree data in current export; field kept in schema for future use).
- **Backfill** — `npm run derive-metadata` re-derives `gameVersion`, `requiredDlcs`, `mods`
  and `modded` for all existing blueprints. **The `?dlc=` filter matches nothing until this
  runs** — no document written before the field existed has a set at all (prod: `cd /bpni/build
&& npm run derive-metadata`, dry-run first).

### Session Management Files

Check these files in `agent/` directory for current status:

- `agent/TODO.md` - Improvement roadmap and remaining work
- `agent/SESSION_NOTES.md` - Session-by-session progress
- `agent/WORKOS_PLAN.md` - WorkOS auth operational reference (env mapping, admin roles)
- `agent/AVATARS.md` - Gemini avatar generation operational reference (API key setup, pool, costs)
- `UPGRADE_PLAN.md` - Upgrade history and strategy

### Quick Status Check Commands

```bash
# Environment verification
node --version        # Should be 20.19.4
npm run test         # Full backend suite (sets up the test DB first)
                     # Use test:only to skip DB setup - but a stale test DB
                     # makes API specs 404, so re-run `npm run test` before
                     # believing a failure there.
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

Uses **migrate-mongo** — Rails-style versioned migrations tracked in the `migrations` collection.
Migration files live in `migrations/` as plain CommonJS `.js` files (no compilation needed).

### Commands

```bash
npm run migrate:status          # show applied / pending migrations
npm run migrate:up              # run all pending migrations
npm run migrate:down            # roll back the last applied migration
npm run migrate:create -- <name>  # scaffold a new migration file
```

### Authoring a migration

Scaffold with `npm run migrate:create -- <name>`, then fill in `up` and `down`:

```js
'use strict';
module.exports = {
  async up(db) {
    // db is the native MongoDB driver Db object
  },
  async down(db) {
    // must fully reverse up — used for rollback
  },
};
```

Rules:

- Both `up` and `down` must be idempotent (safe to re-run if interrupted).
- Never `$unset` the old field in the same operation that reads it as a filter.
- Set new fields first, verify counts, clean up old fields in a separate migration.
- Leave orphaned old fields in place; they disappear naturally once removed from the Mongoose schema.

### Credential rules

- Admin URI (`doadmin`) — DO app console env only. Never on local machine.
- `doctl` — installed; use it freely for reads (app logs, specs, deployments). The API
  token is normally **read-only**; writes (`doctl apps update` etc.) fail by design. For
  rare write tasks Kevin temporarily swaps in a full-access token and removes it after —
  if a write fails on permissions, ask, don't work around it.
- Read-only URI — `/.env.migration` (gitignored). Safe to store; cannot write to DB.
- `/.env` — local dev only. Never put prod or staging credentials here.
- `/prod-dump/` — gitignored. Real prod data; never commit.

### Pre-merge process for every migration

```bash
# 1. Tests pass
npm run test

# 2. Check status and run against local DB
npm run migrate:status
npm run migrate:up

# 3. Dump prod using read-only credentials
source .env.migration
mongodump --uri="$PROD_READONLY_URI" --out=./prod-dump

# 4. Restore prod dump locally under a separate DB name
mongorestore --uri="mongodb://localhost:27017" --db="bpni-prod" --drop ./prod-dump/blueprintnotincluded

# 5. Run against real prod data — this is where you catch actual problems
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:status
DB_URI=mongodb://localhost:27017/bpni-prod npm run migrate:up
# Inspect results before proceeding
```

### Post-deploy execution (DO app console)

```bash
# DO dashboard → prod cluster → Backups → Create backup now  (wait for completion)
npm run migrate:status   # confirm which migrations are pending
npm run migrate:up
```

**First deploy with migrate-mongo:** prod has no `migrations` tracking collection yet.
`migrate:up` will run all migrations from the beginning. The ported Migration 1
(`20260403000000_blueprint-deleted-to-deletedAt`) is idempotent — it filters on
`{ deletedAt: { $exists: false } }` so it safely no-ops on already-migrated documents.

### Rollback

`npm run migrate:down` rolls back the last migration via its `down` method.
For a full restore: DO dashboard → Backups → restore the pre-deploy snapshot to a new cluster → update `DB_URI` env var in App Platform.

---

## Work Session Lifecycle

Every work session has a defined start and end. AI code review and CI run on pull
requests, so a session that ends with only local commits is a dead session — the work
sits invisible until someone comes back and pushes it. Do not stop at "committed".

**Session start:**

1. `git fetch origin master`
2. Create a new branch based on `origin/master` (master is push-protected; never work on it)

**During the session — committing:**

Commit autonomously at every logical break point — do NOT pause to ask permission.
A logical break point is: a feature complete, a refactor complete, tests passing, a migration applied, or any other self-contained unit of work.

Commit message format:

- Subject: conventional commits style (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), ≤72 chars
- Body (when the why is non-obvious): explain motivation and any constraints a future reader would need; skip if the subject is self-explanatory
- Always append a `Co-Authored-By` trailer with the current model name, e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

Stage only relevant files — never `git add -A` blindly. Do not skip hooks (`--no-verify`).

**Session end — push and open a PR (autonomously, without asking):**

1. Update any committed docs that describe shipped state (e.g. `spec/ROADMAP.md`, `agent/TODO.md`) so they reflect what this branch ships
2. `git push -u origin <branch>`
3. `gh pr create` with a real description: what shipped, design decisions and spec deviations, how it was verified (test counts, migrations run), and anything deferred
4. Report the PR URL as the session's final output

## Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
