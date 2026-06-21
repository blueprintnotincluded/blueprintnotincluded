# Migration Plan: OniExtract2020 → OniExtract2024 (flat-icon rendering)

Game version: **U59-737790-SCA** (Spaced Out DLC). Decision: **accept the flat-icon
render model** — re-point rendering to the single `ui_image/` PNG per building, dropping
the multi-sprite atlas pipeline. Source export lives in `export/` (see
`export/WEBSITE_MIGRATION.md`).

## Key findings from exploration

- The 2024 export is **not** a field-rename migration. `building.json` →
  `bBuildingDefList[]` carries **no per-building sprite atlas data** (`spriteInfos`,
  `spriteModifiers`, `textureName`, `kanimPrefix`, `sprites.spriteNames` all gone).
  Instead each building has a single `uiSpriteName` plus one flat pre-rendered PNG in
  `export/ui_image/` (1,241 files). The old multi-sprite/rotation canvas renderer cannot
  be fed by this data.
- `spriteModifiers` (6,724 atlas transform entries) is **removed entirely** (doc §4).
- **Doc §3 is wrong about image filenames.** Files are named by **prefab-tag key**
  (e.g. `FabricatedWood.png`), NOT display name (`Plywood.png`). Verified 1241/1241 match
  by key, only 103/103 by `.name`. Wire image lookups to the prefab key.
- **`EXPORT_SCHEMA.md` received** (2026-06-20, now in `export/`). Covers all 13 files. It
  resolves the deferred schemas for `entities`/`items`/`recipe`/etc. (see "New data now
  documented" below). **Caveat: it is idealized in places — see "Schema vs. actual" below.**
- Structural renames confirmed: `elementTable` dict (keyed by decimal SimHash string),
  `uiSpriteInfos` dict (keyed by prefab tag), `buildingAndSubcategoryDataPairs` dict of
  `{Key,Value}` pairs for the build menu.
- **`viewMode` is a Klei `HashedString` hex** (e.g. `0x1EDC6185`), NOT the old 0–11 int and
  NOT the name string the schema shows (`"Default"`). All 12 distinct hashes were reverse-
  engineered via `Hash.SDBMLower` and mapped to the `Overlay` enum (map embedded in the
  converter): Power / LiquidConduit→Liquid / GasConduit→Gas / Logic→Automation /
  SolidConveyor→Conveyor / Oxygen / Temperature / Decor / Light / Rooms→Room /
  Radiation→Unknown / `0x0`→Base.
- **Enum orderings verified against `attribute.json`:** lib `PermittedRotations`
  (`Unrotatable=0,R90=1,R360=2,FlipH=3,FlipV=4`) matches exactly, so the converter's raw-int
  pass-through is correct.

### Status (2026-06-20, branch `export-aqua`)
- ✅ **Phase 1 done** — `lib/src/b-export/b-export-2024.ts` (raw 2024 types, exported from lib).
- ✅ **Phase 2 done** — `app/api/batch/convert-export-2024.ts` (`npm run convert:2024`,
  `--dry-run`) emits `assets/database/database-2024.json` (separate from the live file).
  Validation **all-zero**: 449 buildings, 212 elements, 365 menu items, 15 categories; 0
  missing icons / unmapped prefabs / unmapped categories / unknown viewMode hashes.
  `npm run tsc` clean.
- ⏸ **Phases 3–6 deferred** by user decision (review before any render rewrite).

### Decisions made
- **Rotations:** render rotated/flipped placements as the **same upright icon, ignore
  orientation** (lowest fidelity, simplest). Supersedes the Phase 4 "open fidelity question".
- **Scope:** existing feature set only (buildings/elements/menu/icons). New data
  (critters/recipes/items/etc.) is separate future work, now unblocked by the schema.

### Schema vs. actual (EXPORT_SCHEMA.md inaccuracies — converter handles the real data)
- `viewMode` shown as name `"Default"`; real export is hex hash `0x…`.
- Image filename: schema/§3 say `ui_image/{uiSpriteInfos[key].name}.png`; files actually
  match by **prefab key** (1241/1241), only 103 by `.name`. Wire lookups to the key.
- `uiSpriteName` shown populated; actually `null` for all 449 buildings.
- `kPrefabID.tags` / `requiredDlcIds` can be a space-separated **string** OR an array (types
  widened accordingly).

## Current data flow (what we're changing)

Three loaders consume the legacy single `database.json`, all calling the same six
`.load()` statics:

| Consumer | File | Source |
|---|---|---|
| Backend | `app/app.ts:31` | `assets/database/database.json` |
| Frontend (prod) | `component-blueprint-parent.component.ts:220` | `database.zip` → `database.json` |
| Frontend (dev fallback) | `component-blueprint-parent.component.ts:286` | loose `database.json` |

All six: `BuildableElement.load`, `BuildMenuCategory.load`, `BuildMenuItem.load`,
`SpriteInfo.load`, `SpriteModifier.load`, `OniItem.load`.

The render path is atlas-based: `BlueprintItem` → `DrawPart` (one per `spriteModifier`) →
`SpriteInfo.getTexture()` slices a texture atlas via UV coords
(`lib/src/drawing/draw-part.ts:59-82`). Each `OniItem` carries a `spriteGroup` of
`spriteModifiers`. **This is exactly the data the 2024 export no longer provides.**

## Strategy: build-time converter + flat-icon render collapse

Rather than rewrite three loaders to ingest 13 files, use a **batch converter**
(`app/api/batch/convert-export-2024.ts`) that reads the new export and emits a single
consolidated `database.json` in a *new internal shape*. The three loaders change
minimally; the heavy mapping lives in one auditable script. The render layer collapses
each building to one flat icon.

### Phase 1 — New-format type definitions (`lib/src/b-export/`)
- Add `b-export-2024.ts`: root types for the 13 files (`BExport2024`, `BBuildingDef2024`,
  `BElementTable`, `BUiSpriteInfo2024`, etc.), modeling the verified shapes
  (`bBuildingDefList[]`, `elementTable` dict, `uiSpriteInfos` dict).
- Keep legacy `b-export.ts` types intact during transition.

### Phase 2 — Converter script (`app/api/batch/convert-export-2024.ts`)
Reads `export/database/*.json` + scans `export/ui_image/`, emits `database.json`:
- **Buildings**: `bBuildingDefList[]` → internal building records. Map
  `nameString`→display name (strip rich-text via §6 regex), `name`→prefab id/lookup key,
  `isFoundation||isKAnimTile`→`isTile`, `widthInCells`/`heightInCells`→`sizeInCells`,
  carry over `materialCategory`/`materialMass`/rotations/layers. Icon =
  `ui_image/{prefabKey}.png` (keyed by prefab tag).
- **Elements**: `elementTable` dict → array (key is decimal SimHash string; match on
  `entry.id`).
- **Build menu**: `buildingAndSubcategoryDataPairs` dict of `{Key,Value}` → legacy
  `buildMenuItems` + `buildMenuCategories`.
- **UI sprites**: `uiSpriteInfos` dict → sprite metadata for icons.
- **Drop** `spriteModifiers` entirely; emit empty/sentinel so loaders don't choke.
- Validation pass: report buildings with a missing `ui_image` PNG, build-menu prefabs
  with no matching building, unmapped categories.

### Phase 3 — Image assets
- Copy `export/ui_image/` (1,241) into `frontend/src/assets/` (e.g. `assets/ui_image/`)
  and the backend `assets/` path. Decide on `ui_image_facade/` (988) only if facade UI is
  used — currently it isn't referenced.
- Retire the old `images/` atlas folder (1,128 in frontend) **after** cutover, not before.
- Point `ImageSource` URL resolution (`lib/src/drawing/image-source.ts:58`) at the
  flat-icon path keyed by prefab id.

### Phase 4 — Render collapse to flat icons (`lib/`)
- `OniItem.load`/`cloneForBuild`: instead of building a `spriteGroup` of modifiers from
  `original.sprites`, assign a **single** sprite = the building's `ui_image` PNG.
  `imageId` becomes the prefab key.
- `DrawPart`/`BlueprintItem`: render one sprite per item from the full PNG (no UV slice,
  no per-part transform). The `spriteModifier`/`SpriteInfo` UV path becomes a no-op
  fallback for the special-case items (element/info overlays at
  `lib/src/oni-item.ts:287-310` still build modifiers in-code — keep those).
- `SpriteModifier.load`/`SpriteInfo.load` receive empty arrays; keep the classes for the
  in-code special items but stop expecting export data.
- **Rotations/orientations (DECIDED):** render rotated/flipped placements as the **same
  upright icon, ignoring orientation** (`lib/src/oni-item.ts:72-80` still computes the
  orientation list for blueprint data, but the renderer draws the upright icon for every
  orientation). No flip/rotate transform. Accept reduced fidelity.

### Phase 5 — Audit & remove `spriteModifiers` (doc §4)
- Remove `spriteModifiers` consumption from the ~12 files that reference it (batch
  scripts + lib + frontend). Some batch scripts (`generate-icons`, `generate-white`,
  `generate-groups`, etc.) exist *to produce* the old atlas data and may be fully retired.

### Phase 6 — Loaders & tests
- Update the three loaders to the new consolidated `database.json` shape (or have them
  call a thin `loadExport2024()` adapter).
- Backend Mocha (141) + frontend Vitest (284): specs that stub
  `database.json`/`uiSprites`/`spriteModifiers` need fixtures regenerated to the new
  shape. Renderer stays mocked (per CLAUDE.md).
- Verify `npm run tsc` + `npm run build` clean; run the app and confirm a blueprint
  renders with flat icons.

## Resolve before coding — RESOLVED
1. ✅ **`EXPORT_SCHEMA.md` received** (in `export/`). Schemas for all 13 files documented.
2. ✅ **Scope confirmed**: buildings/elements/menu/icons only. New capabilities below are
   separately-scoped future work.

## New data now documented (out of current scope — future work)
The schema unblocks these if/when we add new capabilities. None are wired up yet.
| File | Root | Count | Use |
|---|---|---|---|
| `entities.json` | `entities[]` | 429 | Critters & plants |
| `items.json` | `eggs[]`/`seeds[]`/`equipments[]` | 47/40/11 | Eggs, seeds, suits |
| `food.json` | `foodInfoList[]` | 64 | Food items |
| `geyser.json` | `geysers[]` | 27 | Geyser types |
| `recipe.json` | `recipes[]` | 173 | Fabricator recipes |
| `multiEntities.json` | `multiEntities[]` | 132 | Space POIs, meteors, comets |
| `tags.json` | `SimHashes`/`prefabIDs` | 212/2382 | Name→hash lookups |
| `attribute.json` | enums + sickness | — | Enum source of truth (PermittedRotations etc.) |
| `po_string.json` | per-namespace dicts | — | **English only** — i18n note: the site has zh/ru/ko; this export ships no other languages |
| `db.json` | duplicant DB (~20 MB) | — | Case-sensitive parse only (`id`/`Id` sibling keys); `JSON.parse`/`jq` are safe |
| `uiSpriteInfo.json` | `uiFacadeInfos` | 988 | Facade sprites (`ui_image_facade/`), only if facade UI is added |

## Sequencing note
Phases 1–4 keep the legacy path working; cutover happens at Phase 6. All 13-file mapping
is isolated in the Phase 2 converter script.
