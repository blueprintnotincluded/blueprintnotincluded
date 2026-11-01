# Agent TODO - Blueprint Not Included

## Current Status

- **Phase**: building-settings editing shipped (PR #212). Multilingual search + content
  locale fully shipped AND activated in prod (2026-08-27) — status doc `spec/language-plan.md`
- **Date**: 2026-08-28
- **Stack**: Node 24.22.2 · TypeScript 5.9.3 strict · Mongoose 8.24 · Express 5.2 · Canvas 3.2.3 · Angular 20 · PrimeNG 20
- **Tests**: 1319 backend (Mocha + Chai, ~18 s) · 1455 frontend (Vitest, none skipped) — all green
- **Enforcement**: zero-warning flags enabled backend, lib, and frontend (`strict` + `strictTemplates`); CI improvements all complete (mongo:8.0.23 + mongosh health check)

## UX polish (2026-10-24) — shipped on `ux-polish`, follow-ups in `specs/`

Shipped: the details page spec sheet ("What's inside": footprint, per-building counts,
material totals; the same numbers in the unfurl description), the paste-and-go "Open a
blueprint" box on Discover, bookmarks ("Save" + a Saved profile tab), the tamer / boiler /
water / storage categories derived from terrain annotations and titles, the light "Paper"
palette, cards that hide zero counts, per-page document titles.

- **Run `npm run derive-metadata -- --recategorize` in production** after deploy: existing
  documents keep "cooling" until it runs (the save path only derives on new saves).
- **Translations** for the new strings (category labels, open box, save button, spec sheet)
  are not in the xlf files: `npm run extract-i18n` rewrites all four files wholesale
  (20k-line diff), so they need a dedicated pass. English source shows meanwhile.
- The larger pieces are specs in the (local, gitignored) `specs/` directory, indexed in
  `specs/README-ux-polish.md`: Blueprints Expanded folder sync, collections, "contains
  building" + size filters, an interactive viewer on the details page, release notes per
  version, featured/curated surfaces, editor discoverability (`?`, command palette,
  getting-started checklist), compatibility flag + research tier, category rules over
  translated titles.

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

## Rocket interiors — follow-ups

Shipped: the habitat facade (hull + landed backdrop) behind a blueprint whose record carries
`rocketInterior`, the `rocketInterior` category, and the fitter that fills the choice in for
stored blueprints (`npm run derive-rocket-interiors`) — `lib/src/blueprint/CLAUDE.md` →
"Rocket interiors". Look-and-feel knobs:
`lib/src/drawing/rocket-backdrop.ts`.

- **In-flight / night / orbit backdrops** — the handoff carries the art; only the landed day
  set is wired. Which one the game shows when was not established.
- **Interior wall panelling** — the game draws a patterned panel texture inside the hull; it
  is not in the handoff, so the room shows the star field.

## Blueprints Expanded (BlueprintsV2) — mod features not yet supported

Audit of 2026-10-21 against the last public mod source (`Sgt_Imalas-Oni-Mods@12fed6b6`,
2026-09-24, after which BlueprintsV2 became a private submodule), the 7.7.0 build shipped in
the monorepo's `AllMods_Automated_Build_FullRelease` (2026-10-16) and the Steam change notes
through 7.7.1. The file format is unchanged since 6.2 (`metadata`) and the 37 registered
`buildingData` Keys in the 7.7 DLL are the September set; the 7.3–7.7 work (snap-to-grid,
clipboard paste, note opacity, rockets/gantries blueprintable) is all in-game UX with no file
impact. Shipped from this audit: the eight `note_arrow_*` symbols, and catalogue rows for the
nine one-field Keys (`lib/src/blueprint/CLAUDE.md` → "Per-building toggles and sliders").
Remaining, by what they need:

**Need new export information (OniExtract2024):**

- **Building skins** — `BuildingFacade { CurrentFacade }` (any skinnable building) and
  `Artable { CurrentStage }` (sculptures, paintings: the chosen artwork). The mod's own Steam
  page names this as the thing "bpni does not support". The export's `ui_image_facade/`
  (988 PNGs, currently skipped) has the art but nothing maps it: needed are
  `Db.GetBuildingFacades()` → `{id, prefabId, name, dlcId/permit, uiSprite file}` and
  `Db.GetArtableStages()` → `{id, prefabId, name, quality (Bad/Okay/Great), anim+file}`,
  one JSON each, plus a flat render per stage for artables (the facade PNGs may already be
  per facade id — confirm the naming). Site side then: render the skinned art on the canvas
  and in previews, show "Skin: X" in the settings panel, and (later) a picker. Mod-added
  skins (`DecorPackA_MoodLamp`, `Backwalls_Backwall`, True Tiles) stay opaque.
- **What is planted** — `SingleEntityReceptacle.requestedEntityTag` now shows as the raw
  seed/egg id. Showing "Prickle Flower" and drawing the crop in the farm tile needs the
  plant/seed names and a flat icon per plant: `entities.json` already carries the entities
  (only the geyser subset is read today) but no plant art is exported.
- **Blueprint list icon** — the mod's top-level `icon`/`icontint` is a building prefab id
  (`BuildingDef.GetUISprite`) _or_ any name in `Assets.Sprites`. The site parses and
  round-trips it but never shows it. Prefab-id icons need nothing new (we have `ui_image/`);
  arbitrary game sprites would need an `Assets.Sprites` export. Low value: the site has
  real thumbnails.

**Site-side only:**

- **Planning Tool shapes** in the client thumbnail, image export and server preview (known
  gap, `lib/src/blueprint/CLAUDE.md` → terrain "Known gap"); only the live canvas draws them.
- **Pixel Pack colours** — `PixelPack { colorSettings }` (serialized colour list) could be
  drawn on the canvas instead of counted as "other stored settings".
- **Third-party mod Keys** seen in the monorepo, all `Assembly_Type`-named and opaque today:
  `PaintYourPipes_ColorableConduit { colorHex, secondaryColorHex, useGreyscaleAnim }` (pipe
  tint — renderable), `AkiTrueTiles_SkinSelectorAddon_TrueTiles_OverrideStorage
  { OverrideElement }`, `SettingsSyncGroups_SyncGroupCarrier { GroupName }`,
  `ComplexFabricatorRibbonController_… { selectedRecipeIds }`, `RotatableRadboltStorage_…`.
- **`EnergyGenerator.batteryRefillPercent` display scale** is unverified in game (see the
  catalogue section) — one capture of a generator set to a known percentage settles it.

## OniExtract2024 follow-ups

Done (see `app/api/batch/convert-export-2024.md`): the import pipeline, the flat-icon
render cutover, legacy-pipeline removal, English `po_string` → `strings.json` flattening,
and the whole modded-buildings feature — both the data layer (`mod`/`modTitle`,
`blueprint.mods`, `GET /api/mods`) and its UI (build-menu badges, details-page mod chips,
the `/mods` supported-mods page).

Open items:

- **Rename `import:2024`** to a version-neutral name — "2024" leaked everywhere from the
  milestone. Keep an alias for one cycle (`convert:2024` already aliases it).
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

- **Step 5 — element-level DLC provenance** is blocked upstream, in OniExtract2024 (not in
  this repo). `elements.json` carries no DLC field, so provenance stops at buildings: a base-game
  building built from a DLC-only material (a Cobalt pipe, Spaced Out! ore) reads as base game.
  Needed from the export: each `elementTable` entry gets a `requiredDlcIds: string[]` in the
  same shape `building.json` already gives `kPrefabID.requiredDlcIds` (raw ids such as
  `EXPANSION1_ID`, `[]` for base game), sourced from the game's `Element.dlcId` /
  `Element.requiredDlcIds` (the `dlcId` field in the game's `elements.yaml`). With that field
  present the converter would copy it through `normalizeDlcIds` like the building path, the
  analyzer would union placed elements' ids into `requiredDlcs`, and the save-path derivation
  would need no schema change. Do not work around it in the converter (there is nothing to read).

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
dormant `uiScreens` model; Angular standalone migration (unblocks bundle splitting).

- **API Documentation** — no OpenAPI/Swagger spec exists
- **Bundle size** — production bundle ~3.25 MB, budget `3.5mb warn / 4mb error`; tightening
  further requires real reduction work (tree-shaking pixi.js, lazy-loading PrimeNG modules)

---

## Next steps

1. **Jargon guard for Google translation passes** (top of Search section) — do before any
   full `derive-search` re-derive.
2. Rename `import:2024` to a version-neutral script name (keep alias one cycle).
3. Monitor WorkOS legacy-user migration (`GET /api/migration/status`); retire the legacy
   migration path when counts hit zero — see `agent/WORKOS_PLAN.md`.
4. Pick the next product increment: blueprint forks, or wiring one of the unread export
   JSONs (critters/recipes/i18n).
