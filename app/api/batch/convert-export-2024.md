# OniExtract2024 import — export contract & converter reference

Reference for `convert-export-2024.ts` (`npm run import:2024`). Covers what a game
export must provide, what the converter produces, and the contract the export side
must honour so re-exports don't silently break rendering.

Game version baseline: **U59-744825-SCRPAN** (all DLC), export dated 2026-10-18.

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
3. Detect connectables (a `connection_sprites/<prefabId>/` dir exists) and take each
   one's render scale from the cell the export declares for it in
   `connection_sprite_cells.json` (canvas ÷ cell, see "Connection-sprite scale" below).
4. Mirror `ui_image/` and `connection_sprites/` into the frontend asset root
   (`frontend/src/assets/`) **content-aware**: a file is rewritten only when it actually
   changed, only removed files are pruned, so unchanged icons keep their mtime (no churn).
   That root is the only copy of the art — the editor fetches it over HTTP and the server
   preview worker resolves it from the built frontend (`resolveAssetBaseDir`), so the
   backend `assets/` carries no sprites. Every PNG written is first **losslessly
   recompressed** (`png-optimize.ts`: zlib 9, adaptive filtering, no palette), which takes
   about 16% off the export's encoding with identical pixels; the perceptual comparison
   below is what makes a re-import of unchanged art see the recompressed file as
   `preserved` rather than a change. The export is **not byte-deterministic**
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
| `database/*.json` (13 files) | building/element data — we read `building.json`, `elements.json`, `uiSpriteInfo.json`, `po_string.json`, plus `geyser.json` + `entities.json` for the terrain catalogue (geysers, and the `Plant`-tagged entities as `kind: 'plant'`) |
| `ui_image_rects.json` (export **root**) | flat-icon placement rects by prefab id — the only delivery path for terrain features' rects (see below) |
| `ui_image/<prefabId>.png` | the single flat icon per building (1,361 files) |
| `connection_sprites/<prefabId>/<0..15>.png` | the 16 tiling states for connectables |
| `connection_sprite_cells.json` (export **root**) | where the cell sits on each connectable's sprites — the source of `connectionScale` (see below) |
| `building_image_report.json` (export **root**) | nothing: diagnostic only, never imported. Per icon, the `anim`, `frame`, `render` (`spawned`/`artOnly`) and `candidates` (states weighed, with sizes) the exporter used; diff it between two exports to see why an icon changed |
| `ui_image_facade/` | nothing today (not copied) |

Current output (480 buildings, U59-744825): 212 elements, 404 build-menu items (395
plan-order entries less the 23 deprecated/debug-only ones, plus the 32 rocket modules),
15 categories, 505 uiSprites (480 building icons + 17 injected element/info overlays + 8
utility-port indicators registered from the export's `ui_image/` PNGs), 31 connectables,
316 buildings with utility ports.

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
to change. Icons downscale to the footprint; connection sprites are rendered at the
canvas-to-cell ratio the export declares (see below). What breaks rendering is changing **framing**, not pixel count.

1. **Icon naming:** `ui_image/<prefabId>.png`, filename == `building.json` `name` (the
   prefab tag, e.g. `FabricatedWood.png` — **not** the display name). The import fails if any
   building lacks its PNG (`buildings missing ui_image PNG`); 480/480 on U59-744825.
2. **`uiImageRect`** (per building, cells, footprint-relative): required for any icon whose
   art overhangs its footprint; see next section. Emitted for 462/480 buildings and all 31
   terrain features; the other 18 stretch to the footprint: 17 tiles, whose art fills the
   cell, and `CrewCapsule`, a deprecated 5×19 prefab the menu never offers whose 137×41
   legacy icon would distort if a legacy blueprint still placed it.
   **Every rect must match its own PNG's pixel aspect** — the import fails otherwise.
3. **Connection sprites:** all 16 of `0–15` present, bitmask `left=1/right=2/up=4/down=8`.
4. **Connectable signal:** the `connection_sprites/<prefabId>/` directory exists
   (`building.json` carries no `tileableLeftRight/tileableTopBottom`).
5. **Connection-sprite geometry** is declared, not inferred:
   - All 16 states share **one canvas size** and **one cell registration** (same centre,
     same pixels-per-cell). Scale them up together.
   - `connection_sprite_cells.json` at the export root carries one entry per
     `connection_sprites/<prefabId>/` dir, `{canvas:{w,h}, cell:{x,y,w,h}}` in pixels
     (top-left origin, `+y` down, real numbers): `canvas` is the PNGs' size, `cell` the
     building's one cell on it. Everything outside `cell` is overhang, in any state,
     `15.png` included (a wire's outline, the transit tube's corner fillets).
   - The cell is **centred on the canvas** and lies within it. The renderer anchors on the
     canvas centre, so the import fails on an entry whose cell centre is more than 0.005
     cells off, whose cell reaches past the canvas, whose canvas is not the size of all 16
     of its PNGs (or one of them is unreadable), or that is malformed.
6. **Building fields we read** keep their names/shapes: `name`, `nameString`,
   `isFoundation`, `isKAnimTile`, `isUtility`, `widthInCells`, `heightInCells`,
   `sceneLayer`, `objectLayer`, `viewMode`, `permittedRotations`, `dragBuild`,
   `buildLocationRule`, `materialCategory`, `materialMass`, `utilities`; plus top-level
   `bBuildingDefList`, `buildMenuCategories`, `buildingAndSubcategoryDataPairs` (both
   halves of each pair: `Key` the prefab, `Value` its subcategory). Adding fields is safe.
7. **`utilities[].type`** values stay the `ConnectionType` enum *member name* (string,
   e.g. `"GasInput"`, `"LogicReset"`) and `utilities[].offset` stays in the game's
   CellOffset convention; see "Utility connection ports" below.

We inject 17 element-tile / info overlay sprites of our own (`element_tile_back`,
`*_tile_front`, `info_back`, `info_front_0..11`) — **don't** provide these. The 8
utility-port indicators, by contrast, come from the export: ship them as
`ui_image/<name>.png` and list the names in `building.json`'s root `utilityIndicators`
(see "Utility connection ports" below).

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
`buildings with uiImageRect placement: N / 480`.

### Two delivery paths

Buildings carry their rect on their `building.json` `bBuildingDefList[]` entry. **Terrain
features cannot** — they are not `BuildingDef`s, so they have no entry there at all. Their
rects arrive instead via `ui_image_rects.json` at the export root: a flat
`prefabId → {x,y,w,h}` map, same units and semantics, covering buildings redundantly (it is
byte-identical to their `building.json` rects) and terrain features exclusively. The
converter reads it only for the terrain catalogue, so there is one source per consumer and
no chance of the two disagreeing about a building.

### The aspect invariant — checked every import

A rect is a claim about a specific image: the PNG maps *linearly* onto it, so `w:h` must
equal the PNG's pixel aspect. When they disagree the icon draws at the wrong size **and**
the wrong offset, silently, for every placement on the site.

That is not hypothetical. The exporter had two passes that both wrote `ui_image/<id>.png` —
a main-menu pass emitting the kanim's authored `ui` atlas sub-rect, and an in-game pass
rendering at ~200 px/cell and measuring the rect from that render. Rects persisted across
runs, images did not, so a main-menu pass after an in-game pass replaced renders with atlas
icons and left the rects describing images no longer on disk. At its worst that affected
302 of 342 buildings on the export side. The exporter now skips prefabs that already have a
measured rect, and runs the check itself at the end of each in-game pass.

The importer checks it too, over what it is about to emit rather than over
`ui_image_rects.json` — buildings source their rects from `building.json`, which is the file
that actually went stale:

```text
for every emitted rect:  |(w/h) - (pngW/pngH)| / (pngW/pngH)  <  0.02
```

Logged as `uiImageRect aspect mismatches: N / M`; a non-zero N fails the import. The 2%
tolerance absorbs the exporter's rounding to 3 decimals. `__tests__/asset-processing/
database-validation.test.ts` asserts the same invariant over the *committed* database, so a
bad import cannot be merged even if someone ignores the exit code.

### Pinned icons — the site's own PNG and rect, kept over the export's

`PINNED_ICONS` (top of the converter) lists prefabs whose flat icon the site keeps in place
of whatever the export ships. It is a manual override in the same family as
`BACK_COLOR_BY_PREFAB`: the export is wrong for the prefab in a way the importer cannot
derive its way out of, so the correction is recorded in the converter and re-applied on every
import instead of being hand-reverted afterwards.

**No icon is pinned today.** The only pin, `FairGasWallPump` (the Wall Pumps mod's kanim
has no frame bounds, so a swoosh effect stretched its render to 1.625×2.0 cells), was
deleted with the 2026-10-18 export, which measures the frames itself and ships the clean
224×220 px render at rect 1.12×1.1. Keep a pin only for a limit the export lists in its
own validator, and name the limit beside the pin. Two such limits are known and unpinned,
because the site has never had better art for them: `SpecialCargoBayCluster` renders only
its window strip, and the three Staterpillar buildings render a bare egg. Both need a pose
override on the export side.

How a pin works:

- The pinned PNG is committed at `assets/manual/ui_image/<prefabId>.png`. The `ui_image/`
  sync mirrors **that file** into the frontend asset root in place of the export's.
- The pinned `rect` replaces the export's `uiImageRect` on the building. Image and rect are
  pinned together because a rect is a claim about one specific image (the aspect invariant
  above) — pinning either alone draws the icon at the wrong size and offset. The uiSprite
  size and the aspect check both read the pinned PNG, so they describe what ships.
- `exportSize` records the export PNG the pin was judged against. When the export ships
  different art for the prefab, the import reports
  `pinned icons whose export art moved: 1 (...)` and exits non-zero: look at the new render,
  then either delete the pin (upstream fixed it) or record the new size (still wrong). A pin
  whose PNG is missing, or whose prefab has left the export, fails the import the same way.

The import log prints `pinned icons : N (...)`. `database-validation.test.ts` asserts that
both served PNGs are byte-identical to the pinned one and that the committed database carries
the pinned rect and sprite size — the guard against a pin being lost by a hand copy of
`ui_image/` rather than by an import.

### Terrain features

The 31 geysers, vents, volcanoes and the oil reservoir ship tight-cropped ~200 px/cell
renders (`GeyserGeneric_big_volcano.png` is 693×725 for a 3×3 footprint), so the stretch
fallback is a visible regression for them rather than a graceful default: the art lands
roughly half a cell low and ~15% small, with the plume overhang cropped away. Every
catalogue entry therefore carries `uiImageRect`, and a test fails if one does not.

## Connection-sprite scale (declared, not measured)

Connection PNGs frame one cell plus overhang into the neighbours, so a PNG's canvas is not
one cell, and the factor varies per building **and** per export framing. The converter reads
the cell from `connection_sprite_cells.json` and stores
`connectionScale {x,y} = {canvas.w ÷ cell.w, canvas.h ÷ cell.h}` in the DB; the renderer
draws each connection part centre-anchored at `100 × connectionScale`, so the cell maps to
one tile and neighbours join flush. The cell must be centred on the canvas (checked; see
contract clause 5), which is what makes the centre anchor right.

| Connectables | `connectionScale` |
|---|---|
| All 16 tiles | 1.5 |
| `Wire`, `WireRefined`, `WireRubber`, the two high-wattage wires, `LogicRibbon`, `SolidConduit` | 1.06 |
| `LogicWire` | 1.04 |
| The 6 gas and liquid conduits | 1.08 |
| `TravelTube` | 2.4 |

Before the 2026-10-18 export the converter *measured* the scale as canvas ÷ the alpha
bounding box of `15.png`, which holds only while the all-connected state is exactly one
cell. It is not: wires and pipes keep a 2–4 px outline (they measured 1.02–1.04, so drew
2–5% small), and the transit tube's corner fillets make its all-connected state 2.4 cells
wide, so it measured ~1.0 and drew at about 40% of its size. That measurement survives only
as a **fallback** for an export without the file, or a connectable the file has no entry
for; the import log names each one (`connection scale measured from 15.png: N (...)`).
Remove it once no export without the sidecar will be imported again.

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
U59 the export ships each as its own flat PNG in `ui_image/<name>.png`, and since
OniExtract2024 #23 it declares the set: `building.json`'s root `utilityIndicators: string[]`
lists the file names (without `.png`) the run wrote. The converter reads that array rather
than carrying its own copy — the names are a contract between the exporter and the renderer,
which keys on them by id, so there is nothing for the importer to assert beyond their
presence. It registers one whole-image sprite per name (`uvMin 0,0`, `uvSize` = the PNG's
real size) and copies the PNGs into the SpriteInfo image root
(`frontend/src/assets/images/`) — `SpriteInfo` resolves `textureName` there, not under
`ui_image/`. `drawPixiUtility` forces a fixed 0.5×0.5-cell draw size, so the icons render
the same regardless of PNG resolution. The import fails when the array is absent or empty
(`utilityIndicators declared: false` — an export older than #23), when an entry is not a
bare file name (`utility indicator names invalid: N` — a path separator, an empty or
non-string value; such entries are skipped before any file is read or written) and when a
named PNG is missing (`utility indicator PNGs missing: N`). The website side of the contract is checked
by `__tests__/asset-processing/database-validation.test.ts`, which asserts the committed
database registers every id the renderer asks for. This replaces the old approach of slicing
the legacy packed-atlas pages (`hat_role_building1`, `1bed_1toilet_locked`,
`action_follow_cam`, `all_artifacts_locked`, `Animal_friends_locked`); nothing references
those pages anymore.

## Rocket modules and attachment

A rocket in a `.blueprint` is ordinary `buildings[]` entries with no rocket-specific key; the
Blueprints mod recomputes the stacking from the game's `BuildingDef`s at placement time. The
export (OniExtract2024 #9) ships the same facts, and the converter carries them onto the
building record, all omit-when-absent:

| Export field | Database field | Notes |
|---|---|---|
| `attachableTo` | `attachableTo` | Hardpoint tag the building must sit on. `"Rocket"` on the 32 modules and `CrewCapsule`; also `OilWell`, `MonumentMiddle`/`MonumentTop`, `LadderBed`, `ReefGenerator`, `UnderwaterVentDrill` — carried, not modelled. |
| `attachablePosition` | `attachablePosition` | Emitted with `attachableTo`. (0,0) on every vanilla module. |
| `attachPoints[{offset, tag}]` | `attachPoints` | Hardpoints offered. Modules: one `Rocket` point at `(0, heightInCells)`; the three `TopOnly` modules have none. `LaunchPad`: `(0,2)`, derived exporter-side from `LaunchPad.baseModulePosition` (the pad has no real `BuildingAttachPoint`). |
| `isRocketModule`, `rocketModulePerformance`, `moduleBuildConditions`, `rocketEngineCluster.maxHeight` | `rocketModule {burden, enginePower, fuelKilogramPerDistance, buildConditions[], engineMaxHeight?}` | Present exactly on the 32 modules. `engineMaxHeight` on the 8 engines. |

Offsets are from the building's **origin cell** (bottom row, column `floor((width-1)/2)`) —
which is exactly `BlueprintItem.position`, so they pass through with no transform. Gate rocket
logic on `rocketModule`, never on `attachableTo` (seven non-module buildings have one) and
never on `showInBuildMenu: false` (76 buildings, only 32 of them modules).

**`permittedRotations` override.** The export gives every module `permittedRotations: 0`
(Unrotatable), which is the game's own value: a module is picked on the rocket-platform screen
and never rotated by hand. The mod places modules from a blueprint and lets them mirror — its
`RocketModuleVisual.GetAllowedRotations()` returns `FlipH`, and a module in a file carries
orientation `0` or `FlipH` (5). So the converter writes `PermittedRotations.FlipH` (3) for
every `isRocketModule` building (`ROCKET_MODULE_PERMITTED_ROTATIONS`), a manual override in
the family of `BACK_COLOR_BY_PREFAB` and `PINNED_ICONS`: right for the game, wrong for what a
blueprint can hold. The editor's rotate action then cycles Neutral → FlipH on a module, as the
mod does.

**Build menu.** `TUNING.BUILDINGS.PLANORDER` (`buildingAndSubcategoryDataPairs`) never lists a
module — the game offers them on the rocket-platform screen — so the plan-order menu alone
leaves modules importable but unplaceable. The converter appends the export's root
`rocketModuleMenu[]` to `buildMenuItems` under the `rocketry` category (id `104161307`), after
that tab's plan-order entries and in the module screen's own order (engines, crew modules,
nosecones, then tanks and cargo). They are deliberately not filtered on
`showInBuildMenu: false`: every module has it, because that flag describes the plan menu this
list supplements. The deprecated/debug-only filter still applies.

Every `buildMenuItems` entry carries the game's **subcategory** (`ladders`, `tiles`,
`pumps`, …), the `Value` half of its plan-order pair. The editor's build menu groups a
category under subcategory headers in the order each first appears in that category's
entries, which is the game's own order, and titles them from
`STRINGS.UI.NEWBUILDCATEGORIES.<SUBCATEGORY>.BUILDMENUTITLE`. An id is only unique within
its category (`pipes` is under plumbing and ventilation), so consumers key groups by both.
Modules have no game subcategory; they get the site's own `rocketmodules`. A pair with an
empty `Value` is filed as `uncategorized`, as the game does, and counted in the report
without failing the import.

The import checks that the two halves of the export agree and fails otherwise:
`rocketModuleMenu` (root, the game's module-screen order) lists exactly the `isRocketModule`
buildings, and a module offers a `Rocket` hardpoint exactly when it is not `TopOnly`.

## Settings ranges

Which user settings a completed building accepts, and their bounds (OniExtract2024 #9). All
omit-when-absent in the export; the converter gathers them under one `settings` key on the
building record, omitted when the building has none (194 of 480 carry it):

| `settings.*` | Buildings | Notes |
|---|---|---|
| `prioritizable: true` | 168 | The completed building keeps a player-set priority. A blueprint can carry `Prioritizable` for any building regardless: there it is the build priority. |
| `userNameable: true` | 11 | |
| `door {doorType, hasComplexUserControls, allowAutoControl}` | 11 | |
| `valve {conduitType, maxFlow}` | `GasValve` (1 kg/s), `LiquidValve` (10 kg/s) | Not on the shutoffs. |
| `limitValve {conduitType, maxLimitKg, displayUnitsInsteadOfMass}` | 3 | 500 each; the solid one counts units. |
| `userControlledCapacity {minCapacity, maxCapacity, wholeValues, units, source}` | 32 | `units` is `kg` (26), `Critters` (5) or `Radbolts` (1). |

These are static facts about the prefab, not the values a blueprint stores (those live in
`buildings[].buildingData`). The settings catalogue reads them to bound and label a stored
value — see "Range-carrying settings" in `lib/src/blueprint/CLAUDE.md`. The import fails on a
capacity `units` value outside `KNOWN_CAPACITY_UNITS`, because the catalogue turns each unit
into a suffix and an unknown one would render as a bare number.

## `viewMode` mapping

`building.json` `viewMode` is the game-native overlay **name** (e.g. `"Power"`,
`"GasConduit"`, `"Logic"`) or `null` when the building has no special overlay. (U59 changed
this from the old Klei `HashedString` hex; the converter no longer parses hex.) The names are
mapped to the `Overlay` enum in `VIEW_MODE_TO_OVERLAY` at the top of the converter (Power,
LiquidConduit→Liquid, GasConduit→Gas, Logic→Automation, SolidConveyor→Conveyor, Oxygen,
Temperature, Decor, Light, Rooms→Room, Radiation/Disease/Crop→Unknown); `null`/`""`→Base. An
unrecognised name is counted in the import report (`unknown viewMode names: N`) and fails the
import.

## Conduit outline colour (`backColor`)

`BBuildingDef2024` carries no overlay-tint field — OniExtract2024 does not export it — so
every building's `backColor` was hardcoded to `0xffffff` from the start of the 2024 pipeline.
The only live consumer is `BlueprintItemWire.drawPixi`: the conduit-content blob it draws for
gas/liquid pipes (`sceneLayer` 3/5) fills its outline in the building's `backColor`, so every
pipe drew a white outline regardless of plain/insulated/radiant — a regression from the
legacy site, where plain pipes were grey, insulated tan, radiant yellow.

`BACK_COLOR_BY_PREFAB` (next to `CONNECTION_TYPE_BY_NAME`) restores this by prefab id,
recovered from the legacy converter's last output
(`git show aaa378b0^:assets/database/database.json`, the day before that file was deleted).
It covers every conduit/wire/logic-ribbon family, not just the two that draw a blob today,
for parity with the legacy table. Prefabs the legacy export genuinely shipped white —
sensors, overflow/preferential-flow segments, ribbon reader/writer, the two `*HighWattage`
bridge variants — are intentionally left at the `0xffffff` default; this is what the legacy
data itself recorded, not an oversight.

Prefabs added after the legacy table was captured (`HighPressureGasConduit(Bridge)`,
`HighPressureLiquidConduit(Bridge)`, `WireRubber(Bridge)`) have no legacy record; they were
assigned their non-high-pressure/non-rubber sibling's colour by family analogy and are
**unverified in-game** — flagged in a comment at the table's definition.

`__tests__/asset-processing/database-validation.test.ts` asserts every building on a
conduit-drawing `sceneLayer` (3 or 5) has a non-white `backColor`, and that the
plain/insulated/radiant triplet for gas and liquid each get three distinct colours.

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

7 of 13 JSONs are intentionally unread today; the schema unblocks them if/when we add
the capability: `items` (eggs/seeds/suits), `food`, `recipe`, `multiEntities` (space POIs),
`tags`, `attribute`, `db` (duplicant DB, ~20 MB, case-sensitive parse). `geyser` and
`entities` are read, but only for the terrain-feature catalogue (geysers and `Plant`-tagged
entities) — the rest of `entities` (critters) is still unused. `ui_image_facade/` (988 files) is also unused. `po_string`
is read (English game strings → `strings.json`); the site is English-only, so the legacy
per-locale `.po` files have been retired — non-English i18n would need translated sources.

## Rendering model — how the site uses the converted data

Rendering uses the 2024 flat-icon model, not the retired multi-sprite atlas.

- **Types**: `lib/src/b-export/b-export-2024.ts` — raw 2024 export shapes (13 files).
- **Import**: `convert-export-2024.ts` (`npm run import:2024`) → consolidated
  `database-2024.json` written to both asset roots (committed; the `.zip` is a gitignored
  build derivative); content-aware syncs `ui_image/` (1,361 flat PNGs) and
  `connection_sprites/` into the frontend asset root, losslessly recompressed.
- **Render**: each building is one flat icon — `OniItem.flatIconId`, `DrawPart.flatIconId`,
  no UV slice. `uiImageRect` (when present) places overhanging art relative to the
  footprint; otherwise the icon is stretched to the footprint.
- **Connectables** (31 prefabs): render `connection_sprites/{prefabId}/{bitmask}.png` per
  4-bit neighbour mask (left=1, right=2, up=4, down=8). `OniItem.connectionSprites` is
  derived from dir presence; `BlueprintItem` builds 16 tagged flat-icon draw-parts;
  per-building `connectionScale` is the canvas ÷ cell ratio from the export's
  `connection_sprite_cells.json`, fixed at import time. The build/select
  menu keeps the single canonical icon (`iconUrl`).
- **Utility ports** (316/480 buildings): `BBuildingDef2024.utilities[]` carries each
  input/output port as `{offset, type, isSecondary}`. The U59 export emits `type` as the
  `ConnectionType` enum _name_ (string); the converter maps it to the int via
  `CONNECTION_TYPE_BY_NAME`. Offsets are pre-rotation/y-up/footprint-relative and already
  match the website's internal convention (no transform). `BlueprintItem.drawPixiUtility`
  draws the markers per overlay; the 8 indicator sprites (`input`/`output`/`logicInput`…)
  are registered from the export's own `ui_image/<name>.png` flats (copied into
  `frontend/src/assets/images/` at import) — they no longer slice the legacy atlas pages.
- **Loaders**: backend reads `database-2024.json` directly; frontend fetches
  `database-2024.zip` (regenerated from the committed JSON by its `prebuild`/`prestart`).
- **Menu thumbnails**: `icon-thumbnails.ts` renders `frontend/src/assets/ui_thumb/<name>.webp`
  (≤128 px a side) for every frontend `ui_image/*.png`, after the sync, content-aware and
  pruned like the sprites. `OniItem.thumbUrl`, `BuildableElement.thumbUrl` and
  `TerrainFeature.thumbUrl` (`StringHelpers.iconThumbUrl`) point at them, and every `<img>`
  of an icon binds those; `iconUrl` stays the full art for the canvas and the preview worker.
- **Canvas textures**: the editor enables PIXI mipmaps (`MIPMAP_MODES.ON`, WebGL2) since the
  icons are drawn at 16–128 px per cell from ~200 px-per-cell art, and skips the render
  pass for items whose cell rectangle (plus a 4-cell margin for overhanging art) is outside
  `CameraService.viewportSize` (`BlueprintItem.drawPixi` → `container.renderable`). A camera
  with no viewport — the preview worker, export cameras — culls nothing.
- **DLC data**: each building record now includes `dlcIds: string[]` (e.g. `['EXPANSION1_ID']`
  for Spaced Out buildings). The converter (`import:2024`) populates this from the raw export's
  `kPrefabID.requiredDlcIds`. Used by `BlueprintAnalyzer` to derive metadata.

## Open items to the export side

Resolved by the 2026-10-11 export (U59-744825): the wire bridges now ship real
`PowerInput(-1,0)`+`PowerOutput(1,0)` ports (all five, the two `*HighWattage` ones
included), so `SYNTHESIZED_BRIDGE_PORTS` no longer fires and stays only as a guard;
`uiImageRect` is emitted for every building whose art deviates from its footprint;
`ui_image_facade/` is no longer shipped.

Resolved by the second 2026-10-11 export (OniExtract2024 #23): the exporter now prunes
its output per run — `ui_image/` and `ui_image_rects.json` to the prefabs loaded at export
time, `connection_sprites/` cleared before each write — so a prefab dropped between runs (a
mod disabled, say) no longer leaves an orphan PNG and rect behind for the sprite sync to
mirror. The eight High Pressure Applications leftovers the morning import deleted by hand are
what the export now omits on its own, so the importer needs no stale-icon handling of its
own. The `RocketEnvelopeWindowTile` connection sprites, stuck at their June date because the
exporter destroyed a texture that tile shared with `GlassTile`, are rewritten every run
again. And the indicator set is declared (`utilityIndicators`, above) rather than assumed.

Resolved by the 2026-10-18 export (OniExtract2024 #24): connection-sprite geometry is
declared (`connection_sprite_cells.json`), so the converter no longer infers the scale from
`15.png` and the transit tube draws at full size; icons are posed in the most active state
whose art stays near the footprint, so effects (steam, sparks, light cones) no longer set an
icon's size; art-only renders of even-width buildings are no longer half a cell left; meter
placeholders are hidden on art-only renders; the render canvas is sized from the art, so no
icon is cut off; and the Wall Pumps mod's kanims are measured from their frames, which
retired the `FairGasWallPump` pin.

Still open:

- **Pose overrides:** `SpecialCargoBayCluster` renders only its window strip and the three
  Staterpillar buildings a bare egg (listed by the export's own validator).

- **Overlay tint (`backColor`):** emit the building's overlay/outline tint so
  `BACK_COLOR_BY_PREFAB` (see above) can be retired in favour of real per-import data instead
  of a hand-recovered table.
- **`conduitColor: 0`:** `Graphite` and `CrudeOil` ship `conduitColor: 0` (and also `color: 0`,
  alongside `Naphtha`/`Aerogel`/`COMPOSITION`) straight through from `elements.json` — not a
  converter mapping slip, since `conduitColor: e.conduitColor` is a direct pass-through. Both
  elements render a solid-black inner blob in a pipe today. Left as-is pending an export-side
  fix or a product decision on a fallback tint.
- **Higher-res `ui_image`:** one test asserts each flat-icon PNG is < 5 MB — flag ahead of
  time if any icon will exceed that.
- **Other unread JSONs:** trim if not coming, or confirm they're for future work.
