# OniExtract2024 import — export contract & converter reference

Reference for `convert-export-2024.ts` (`npm run import:2024`). Covers what a game
export must provide, what the converter produces, and the contract the export side
must honour so re-exports don't silently break rendering.

Game version baseline: **U59-737790-SCA** (Spaced Out DLC).

## Pipeline

```
npm run import:2024            # regenerate DB + assets from ./export
npm run import:2024:dry-run    # validate + report counts, write/copy nothing
# convert:2024 is a kept alias for import:2024
```

Steps:
1. Read `export/database/*.json`, map to the website's consolidated shape (field
   renames, `viewMode` hash → overlay, flat-icon model, build menu).
2. Write `database-2024.json` into **both** asset roots (backend `assets/database/` +
   `frontend/src/assets/database/`). The loose JSON is the only committed runtime DB
   artifact (readable diffs). The backend reads it directly at startup; the frontend
   zips it into the gitignored `database-2024.zip` it fetches, via its `prebuild`/
   `prestart` (`frontend/scripts/build-database-zip.js`). The converter emits no `.zip`.
3. Detect connectables (a `connection_sprites/<prefabId>/` dir exists) and **measure**
   each one's render scale from its `15.png`.
4. Mirror `ui_image/` and `connection_sprites/` into both asset roots **content-aware**:
   a file is rewritten only when it actually changed, only removed files are pruned, so
   unchanged icons keep their mtime (no churn). The export is **not byte-deterministic**
   across game updates — Klei re-rasterizes untouched art, spraying sub-pixel anti-aliasing
   jitter along icon edges — so a byte-different PNG is additionally compared *perceptually*
   (`pngVisuallyEqual`: alpha-premultiply → 2-pass Gaussian blur → count pixels still
   differing by more than a threshold) and **preserved** when visually identical. The blur
   is what separates genuine redraws from re-rasterization jitter even on densely-textured
   sprites (doors, gas blobs), where a raw pixel count cannot. Sync logs report the preserved
   count as `preserved N re-encoded`. `ui_image_facade/` is skipped (unused; one-line flip
   near the top of the converter to enable).
5. Flatten `database/po_string.json` into `frontend/src/assets/strings/strings.json` —
   the English game-string map the website resolves display names against (element,
   building, category names + overlay labels). Keys are prefixed with `STRINGS.` to match
   what the frontend's `GameStringService` queries; values keep their `<link=…>` markup,
   which the service strips at load. Frontend-only (strings aren't used server-side).
   **Without this step, freshly added elements render their raw `<link=…>` markup in the
   build menu** (the lookup misses and falls back to the raw DB name).
6. Validate; exit non-zero on an incomplete import (missing icon, a connection dir
   missing one of `0–15`, a connectable that's neither tile nor utility, `po_string.json`
   absent, etc.).

Re-running on the same export is a near no-op: the JSON and every sprite are written
only when their content actually changed. The export encoder is deterministic, so
unchanged pixels stay byte-identical and git shows only genuine changes.

## What the export ships / what we read

| Export provides | We use it for |
|---|---|
| `database/*.json` (13 files) | building/element data — we read `building.json`, `elements.json`, `uiSpriteInfo.json`, `po_string.json` |
| `ui_image/<prefabId>.png` | the single flat icon per building (1,241 files) |
| `connection_sprites/<prefabId>/<0..15>.png` | the 16 tiling states for connectables |
| `ui_image_facade/` | nothing today (not copied) |

Current output (487 buildings): 212 elements, 402 build-menu items, 15 categories,
512 uiSprites (487 building icons + 17 injected element/info overlays + 8 utility-port
indicators registered from the export's `ui_image/` PNGs), 33 connectables, 322 buildings
with utility ports.

## Image model — two kinds, used differently

**1. `ui_image/` flat icons (one per building).** Shown in the build/select menu and as
the picture of a placed non-tiling building. The renderer maps each icon onto the
building's footprint box (1 cell = 100 px on screen). With no placement data it would
*stretch to fill* the footprint, which only looks right when the icon's opaque content
equals the footprint. Tight-cropped animation renders overhang the footprint, so they
need `uiImageRect` (below).

**2. `connection_sprites/<prefabId>/0..15.png` (16 states of a connectable).** Wires,
pipes, rails, tiles. The editor picks one of 16 by neighbour bitmask
(`left=1, right=2, up=4, down=8`; `15.png` = connected all four sides — identical to the
website's existing `tileConnections`/wire convention, no remap). The build/select menu
still uses the single canonical icon; only placed-item rendering uses the 16 states.

## Contract — don't break these (everything else, incl. resolution, can change freely)

The pipeline is **resolution-independent**: ship bigger/sharper images and nothing needs
to change. Icons downscale to the footprint; connection sprites are rendered at a measured
ratio (see below). What breaks rendering is changing **framing**, not pixel count.

1. **Icon naming:** `ui_image/<prefabId>.png`, filename == `building.json` `name` (the
   prefab tag, e.g. `FabricatedWood.png` — **not** the display name). Verified 1241/1241
   match by key.
2. **`uiImageRect`** (per building, cells, footprint-relative): required for any icon whose
   art overhangs its footprint; see next section. Currently emitted for 308/449 buildings;
   the other 141 fall back to stretch-to-footprint.
3. **Connection sprites:** all 16 of `0–15` present, bitmask `left=1/right=2/up=4/down=8`.
4. **Connectable signal:** the `connection_sprites/<prefabId>/` directory exists
   (`building.json` carries no `tileableLeftRight/tileableTopBottom`).
5. **Connection-sprite geometry** (so the measured scale stays correct):
   - All 16 states share **one canvas size** and **one cell registration** (same centre,
     same pixels-per-cell). Scale them up together.
   - In `15.png` the opaque pixels equal **exactly one cell, centred**. Overhang/caps on
     *disconnected* sides in other states is fine and expected. `15.png` is our measuring
     stick; if it gains overhang or goes off-centre our scale goes wrong.
6. **Building fields we read** keep their names/shapes: `name`, `nameString`,
   `isFoundation`, `isKAnimTile`, `isUtility`, `widthInCells`, `heightInCells`,
   `sceneLayer`, `objectLayer`, `viewMode`, `permittedRotations`, `dragBuild`,
   `buildLocationRule`, `materialCategory`, `materialMass`, `utilities`; plus top-level
   `bBuildingDefList`, `buildMenuCategories`, `buildingAndSubcategoryDataPairs`. Adding
   fields is safe.
7. **`utilities[].type`** values stay the `ConnectionType` enum *member name* (string,
   e.g. `"GasInput"`, `"LogicReset"`) and `utilities[].offset` stays in the game's
   CellOffset convention; see "Utility connection ports" below.

We inject 17 element-tile / info overlay sprites of our own (`element_tile_back`,
`*_tile_front`, `info_back`, `info_front_0..11`) — **don't** provide these. The 8
utility-port indicators, by contrast, now come from the export: ship them as
`ui_image/<name>.png` (see "Utility connection ports" below).

## `uiImageRect` — flat-icon placement

Per building, the rendered PNG's rectangle **in cell units, relative to the footprint**.
Omit it to mean "image == footprint" (legacy stretch-to-footprint fallback).

```jsonc
// on each building.json bBuildingDefList[] entry
"uiImageRect": { "x": 0, "y": -1.24, "w": 5, "h": 4.24 }
```

- Footprint occupies `(0,0)` bottom-left to `(widthInCells, heightInCells)` top-right.
  `+x` right, `+y` **up**. Units = cells, **real numbers** (do not round).
- `x, y` = bottom-left corner of the **image**; `w, h` = image size in cells. The rect
  describes the whole PNG, mapped linearly, so its pixel aspect must equal `w:h`.
- Overhang = going outside the footprint: `y` negative ⇒ art hangs below (e.g. a steam
  turbine's exhaust); `x+w > widthInCells` ⇒ extends right; etc.

Compute (export side), with `ppc` = render pixels-per-cell, origin at footprint bottom-left:

```
w = imgPxW / ppc
h = imgPxH / ppc
x = (artLeft   - footprintLeft)   / cellSize
y = (artBottom - footprintBottom) / cellSize   // flip sign if computed in image space (+y down)
```

This is the same information the 2020/2023 atlas carried as `pivot` + `realSize`. The
converter passes it through and the renderer draws into the rect (unit-tested in
`__tests__/lib/draw-part-placement.test.ts`); buildings without it keep the old behaviour
so nothing regresses mid-rollout. The import log prints
`buildings with uiImageRect placement: N / 449`.

## Connection-sprite scale (measured, not assumed)

Connection PNGs frame one cell plus optional cap/overhang, so a PNG's canvas is not
necessarily one cell, and the factor varies per building **and** per export framing (an
early export measured tiles at ~1.5×, a later one tightened to ~1.0×). The converter
therefore measures scale per building from the `15.png` alpha bbox (`canvas px ÷ cell px`)
and stores `connectionScale {x,y}` in the DB; the renderer draws connection parts
centre-anchored at `100 × connectionScale`. Re-measured every import, so it auto-adapts to
new framing/resolution. No mod/export change needed.

## Utility connection ports (plumbing / power / automation / shipping indicators)

Each building carries `utilities[]` — the input/output ports the editor draws as little
markers when you switch to the matching overlay (plumbing, ventilation, power, automation,
shipping). One entry per port:

```jsonc
// building.json bBuildingDefList[].utilities[]
{ "offset": { "x": -1, "y": 0 }, "type": "GasInput", "isSecondary": false }
```

- **`type`** — the `ConnectionType` enum **member name** as a string (added in U59;
  earlier exports used the int). The converter maps it to the int via
  `CONNECTION_TYPE_BY_NAME` (`PowerInput=0 … LogicRibbonOutput=14`). `NONE` and
  `LogicControlInput` never appear; MUX/DEMUX selector ports come through as plain
  `LogicInput`. An unrecognised name is dropped and counted in the import report
  (`unknown connection types: N`), which also fails the import.
- **`offset`** — cell offset, **pre-rotation, y-up, footprint-relative**. This is the
  game's CellOffset convention and it matches the website's internal coordinates **exactly**
  (verified field-by-field against the pre-2024 DB — LiquidPump/GasFilter/LogicGateAND/etc.
  all identical), so the converter passes offsets through with **no transform**. The
  renderer (`BlueprintItem.drawPixiUtility`) draws each marker at this offset and rotates it
  with the building.
- **`isSecondary`** — true for a building's second port of one conduit type (filter bypass
  output, overflow-valve overflow outlet). The renderer tints these orange (`0xFBB03B`)
  instead of white/green. U59 sets it reliably; earlier exports did not.

**Synthesized power-bridge ports (workaround for an export gap).** The U59 export ships the
power/wire bridges with an **empty** `utilities[]`, even though every other conduit bridge
emits `Input(-1,0)`+`Output(1,0)` (gas/liquid/solid/logic all do, verified). With no ports the
editor draws no connection markers for them. The converter fills the gap for the three 3×1
standard wire bridges — `WireBridge`, `WireRefinedBridge`, `WireRubberBridge` — synthesizing
`PowerInput(-1,0)`+`PowerOutput(1,0)` (`SYNTHESIZED_BRIDGE_PORTS`), the exact offsets the 3×1
conduit bridges use. It fills **only an empty array**, so a fixed future export takes
precedence automatically; the import logs `synthesized power-bridge ports: N`. The two 1×1
HighWattage bridges (`WireBridgeHighWattage`, `WireRefinedBridgeHighWattage`) are **not**
covered — their port geometry isn't derivable from this export. The real fix is export-side
(see "Open items").

**Indicator sprites.** The markers themselves (`input`, `output`,
`electrical_disconnected`, `logicInput`, `logicOutput`, `logicResetUpdate`,
`logic_ribbon_all_in`, `logic_ribbon_all_out`) are resolved by id in
`ConnectionHelper.getConnectionSprite` (tint applied at draw time, no spriteModifier). Since
U59 the export ships each as its own flat PNG in `ui_image/<name>.png`, so the converter
registers all 8 as whole-image sprites (`uvMin 0,0`, `uvSize` = the PNG's real size) and
copies the PNGs into the SpriteInfo image root (`frontend/src/assets/images/`) — `SpriteInfo`
resolves `textureName` there, not under `ui_image/`. `drawPixiUtility` forces a fixed
0.5×0.5-cell draw size, so the icons render the same regardless of PNG resolution. The import
fails (`utility indicator PNGs missing: N`) if the export drops any of the 8. This replaces
the old approach of slicing the legacy packed-atlas pages (`hat_role_building1`,
`1bed_1toilet_locked`, `action_follow_cam`, `all_artifacts_locked`, `Animal_friends_locked`);
nothing references those pages anymore.

## `viewMode` mapping

`building.json` `viewMode` is the game-native overlay **name** (e.g. `"Power"`,
`"GasConduit"`, `"Logic"`) or `null` when the building has no special overlay. (U59 changed
this from the old Klei `HashedString` hex; the converter no longer parses hex.) The names are
mapped to the `Overlay` enum in `VIEW_MODE_TO_OVERLAY` at the top of the converter (Power,
LiquidConduit→Liquid, GasConduit→Gas, Logic→Automation, SolidConveyor→Conveyor, Oxygen,
Temperature, Decor, Light, Rooms→Room, Radiation/Disease/Crop→Unknown); `null`/`""`→Base. An
unrecognised name is counted in the import report (`unknown viewMode names: N`) and fails the
import.

## Schema-vs-actual caveats

`EXPORT_SCHEMA.md` (in the export) is idealized in places; the converter handles the real
data:
- `viewMode` shown as a name (`"Default"`); real export is a hex hash.
- Image filenames documented by display name; reality is prefab key.
- `uiSpriteName` shown populated; actually `null` for all 449 buildings.
- `kPrefabID.tags` / `requiredDlcIds` can be a space-separated **string** OR an array.
- Element `state` is inconsistent: the enum *name* (`"Solid"`) for most solids, its raw
  numeric value as a string (`"5"`, `"6"`, `"20"`) for everything else — and the numeric
  form carries flag bits above the phase. `parseElementState()` accepts either and masks
  to the low 2 bits, giving the `ElementState` enum (Vacuum/Gas/Liquid/Solid).

## Element mass and temperature defaults

`elements.json` carries the load-time constants the game seeds its own mass/temperature
pickers with, so the website no longer applies one hardcoded default to every element:

| field                | unit   | notes                                          |
| -------------------- | ------ | ---------------------------------------------- |
| `maxMass`            | kg     | sim cell capacity                              |
| `defaultMass`        | kg     | what the game pre-fills                        |
| `defaultTemperature` | Kelvin | same scale as `lowTemp` / `highTemp`           |
| `lowTemp`/`highTemp` | Kelvin | phase-change bounds, used as the picker's range |

These are independent values, not derivable from each other: Crude Oil defaults to 350 K
inside a 233–673 K range, and Chlorine defaults to 600 kg against a 1000 kg capacity.

Gases are the reason this can't be a static table. `gas.yaml` ships without `maxMass`,
`defaultMass` or `highTemp`; `ElementLoader.CopyEntryToElement` applies `maxMass = 1.8`,
`defaultMass = 1.0` and `highTemp = defaultTemperature + 100` at load time. The converter
asserts both halves of that contract and fails the import on either:

- every gas has `maxMass == 1.8` and `defaultMass == 1.0` — a violation means the exporter
  read the YAML instead of the runtime `Element`, and every gas mass picker is wrong;
- `defaultMass <= maxMass` for every element, which the game enforces itself in
  `ElementLoader.CheckElements()`.

Current export: 32 gas, 52 liquid, 125 solid, 3 vacuum.

## Unused export files (future capabilities, not wired up)

9 of 13 JSONs are intentionally unread today; the schema unblocks them if/when we add
the capability: `entities` (critters/plants), `items` (eggs/seeds/suits), `food`,
`geyser`, `recipe`, `multiEntities` (space POIs), `tags`, `attribute`, `db` (duplicant DB,
~20 MB, case-sensitive parse). `ui_image_facade/` (988 files) is also unused. `po_string`
is read (English game strings → `strings.json`); the site is English-only, so the legacy
per-locale `.po` files have been retired — non-English i18n would need translated sources.

## Open items to the export side

- **Power-bridge `utilities[]`:** the wire bridges ship an empty `utilities[]` while every
  other conduit bridge emits `Input(-1,0)`+`Output(1,0)`. Emit the power ports for
  `WireBridge`/`WireRefinedBridge`/`WireRubberBridge` (and the 1×1 `*HighWattage` bridges,
  whose offsets we can't derive) so the converter's `SYNTHESIZED_BRIDGE_PORTS` workaround can
  be removed.
- **`uiImageRect` rollout:** emit it for the remaining ~107 buildings whose art deviates
  from the footprint (the rest can omit it).
- **`ui_image_facade/`:** drop it to shrink the handoff, or tell us what it's for.
- **Higher-res `ui_image`:** one test asserts each flat-icon PNG is < 5 MB — flag ahead of
  time if any icon will exceed that.
- **Other unread JSONs:** trim if not coming, or confirm they're for future work.
