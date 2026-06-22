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
2. Write `assets/database/database-2024.json` + both `database-2024.zip` files
   (backend `assets/` + `frontend/src/assets/`).
3. Detect connectables (a `connection_sprites/<prefabId>/` dir exists) and **measure**
   each one's render scale from its `15.png`.
4. Mirror `ui_image/` and `connection_sprites/` into both asset roots, **replacing**
   the targets so renamed/removed files don't linger. `ui_image_facade/` is skipped
   (unused; one-line flip near the top of the converter to enable).
5. Validate; exit non-zero on an incomplete import (missing icon, a connection dir
   missing one of `0–15`, a connectable that's neither tile nor utility, etc.).

Re-running on the same export is safe (only `.zip` bytes differ run-to-run).

## What the export ships / what we read

| Export provides | We use it for |
|---|---|
| `database/*.json` (13 files) | building/element data — we read only `building.json`, `elements.json`, `uiSpriteInfo.json` |
| `ui_image/<prefabId>.png` | the single flat icon per building (1,241 files) |
| `connection_sprites/<prefabId>/<0..15>.png` | the 16 tiling states for connectables |
| `ui_image_facade/` | nothing today (not copied) |

Current output (449 buildings): 212 elements, 365 build-menu items, 15 categories,
466 uiSprites (449 building icons + 17 injected overlays), 31 connectables.

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
   art overhangs its footprint; see next section. Currently emitted for 342/449 buildings;
   the other 107 fall back to stretch-to-footprint.
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
   `buildLocationRule`, `materialCategory`, `materialMass`; plus top-level
   `bBuildingDefList`, `buildMenuCategories`, `buildingAndSubcategoryDataPairs`. Adding
   fields is safe.

We inject a few overlay sprites of our own (`element_tile_back`, `*_tile_front`,
`info_back`, `info_front_0..11` — 17 entries) — **don't** provide these.

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

## `viewMode` mapping

`building.json` `viewMode` is a Klei `HashedString` hex (e.g. `0x1EDC6185`), not the old
0–11 int or a name string. The 12 distinct hashes are reverse-engineered via
`Hash.SDBMLower` and mapped to the `Overlay` enum in `VIEW_MODE_TO_OVERLAY` at the top of
the converter (Power, Liquid, Gas, Automation, Conveyor, Oxygen, Temperature, Decor, Light,
Room, Radiation→Unknown, `0x0`→Base).

## Schema-vs-actual caveats

`EXPORT_SCHEMA.md` (in the export) is idealized in places; the converter handles the real
data:
- `viewMode` shown as a name (`"Default"`); real export is a hex hash.
- Image filenames documented by display name; reality is prefab key.
- `uiSpriteName` shown populated; actually `null` for all 449 buildings.
- `kPrefabID.tags` / `requiredDlcIds` can be a space-separated **string** OR an array.

## Unused export files (future capabilities, not wired up)

10 of 13 JSONs are intentionally unread today; the schema unblocks them if/when we add
the capability: `entities` (critters/plants), `items` (eggs/seeds/suits), `food`,
`geyser`, `recipe`, `multiEntities` (space POIs), `tags`, `attribute`, `po_string`
(English-only — note the site has zh/ru/ko, so i18n needs more here), `db` (duplicant DB,
~20 MB, case-sensitive parse). `ui_image_facade/` (988 files) is also unused.

## Open items to the export side

- **`uiImageRect` rollout:** emit it for the remaining ~107 buildings whose art deviates
  from the footprint (the rest can omit it).
- **`ui_image_facade/`:** drop it to shrink the handoff, or tell us what it's for.
- **Higher-res `ui_image`:** one test asserts each flat-icon PNG is < 5 MB — flag ahead of
  time if any icon will exceed that.
- **`po_string` / other JSONs:** trim if not coming, or confirm they're for future work.
