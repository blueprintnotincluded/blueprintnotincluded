# After the Export: What the Website Does With Your Files

**Direction:** website → export. Read this before changing the exported assets (especially
**image resolution**) so a change on your side doesn't quietly break rendering on ours.

You export from the game and get a folder of files. You drop that folder into the website repo
(`./export`) and run one script. This explains what that script does, what each image is used
for, and — the part you actually care about right now — **what happens if you make the images
bigger / higher resolution.**

---

## The one step you run

```
npm run import:2024
```

(Yes, the name is unfortunate — "2024" leaked everywhere from the OniExtract2024 milestone.
There's a `convert:2024` alias and an `import:2024:dry-run` that validates without writing.
Renaming is on our cleanup list; behaviour is what matters here.)

You hand over a folder containing:

| you ship | we use it for |
|---|---|
| `database/*.json` (13 files) | building/element data (we actually read only 3 — see end) |
| `ui_image/<prefabId>.png` | the single icon per building |
| `connection_sprites/<prefabId>/<0..15>.png` | the 16 tiling states for connectables |
| `ui_image_facade/` | nothing (we don't use it today) |

---

## What the images are used for

There are **two kinds of images**, used very differently:

**1. `ui_image/` — one flat icon per building.**
Shown in the build/select menu and as the picture of a placed, non-tiling building. Each is
**stretched to fill the building's footprint box** (1 tile = 100 px on screen), bottom-anchored.
Because we stretch-to-footprint with no placement data, the icon's content must *be* the
footprint — see the framing section below; this is what the animation-based export broke.

**2. `connection_sprites/<prefabId>/0..15.png` — the 16 states of a connectable.**
For wires, pipes, rails, and tiles. When you place a run of them, the editor picks the right
one of the 16 by looking at which neighbours connect (a 4-bit code: left=1, right=2, up=4,
down=8; e.g. `15.png` = connected on all four sides). These **must tile flush** against their
neighbours, so how they're framed matters (see resolution rules below).

The steam turbine you saw looking blurry is a **`ui_image/` icon** (it's not a connectable) —
so fixing it is purely "ship a sharper `ui_image/SteamTurbine.png`." No script change.

---

## ⭐ Increasing image resolution — yes please, here's the rule

**Good news: our pipeline is resolution-independent. You can ship bigger, sharper images and
in almost all cases we need to change nothing.** Here's why, per image type:

**`ui_image/` icons (e.g. the steam turbine):**
- Resolution itself is free: we scale each icon to the building footprint, so a bigger source
  PNG is just a sharper downscale. *Caveat:* one test asserts each flat-icon PNG is **under
  5 MB** — ping us if one will exceed that.
- ⚠️ **BUT there is a framing assumption — see the next section.** We stretch the icon to fill
  the footprint box exactly, so the icon's content must *be* the footprint. Switching from
  footprint-framed UI sprites to tight-cropped animation renders **breaks this** (squished
  aspect, lost overhang) even though the pixels got sharper. That part is NOT free.

**`connection_sprites/`:**
- We don't assume any fixed pixel size. For each connectable we **measure** a scale factor
  (`canvas px ÷ cell px`) from the all-connected `15.png` every time you import, and render at
  that ratio. Double the resolution and the ratio is unchanged → same on-screen size, sharper
  texture. **Also no script change.**
- The measurement re-runs on every `import:2024`, so it adapts automatically to new pixel sizes.

**The one thing that breaks us is changing the _framing_, not the resolution.** Keep these and
you can re-export at any resolution freely:
1. All 16 states of a building keep **one shared canvas size** and **one cell registration**
   (same centre, same pixels-per-cell across the 16). Scale them up together.
2. In the **all-connected state (`15.png`)**, the opaque pixels still equal **exactly one cell,
   centred** in the canvas. (Overhang/caps on *disconnected* sides in the other states is fine —
   that bleeds past the cell on purpose.) This state is our measuring stick; if it gains
   overhang or goes off-centre, our scale goes wrong.

**When would a resolution change also need a script fix here?** Only if it comes *with* a
framing change — e.g. you switch connection sprites to a different cell-to-canvas ratio AND
that breaks rule 2 above, or you change how `ui_image` icons are framed (next section).
Pure "same framing, more pixels" = zero changes on our side.

---

## ⚠️ `ui_image` framing — the steam-turbine / auto-sweeper problem

**Symptom (animation-based export):** the steam turbine's overhang no longer hangs below the
footprint, the auto-sweeper looks squished. Higher resolution, but the geometry is wrong.

**Cause.** Today the website **stretches each `ui_image` to exactly fill the footprint box**
(`widthInCells × heightInCells`, one cell = 100 px, bottom-anchored), with **no per-image
placement data**. That only looks right when the image's opaque content equals the footprint.

- The **old UI-sprite export** produced footprint-shaped icons, so the stretch was harmless.
- The **animation/tight-crop export** crops to the art's true bounding box, which is taller
  and/or wider than the footprint because the art **overhangs** it. Stretching that into the
  footprint box crushes the overhang and squishes the proportions. (Measured: new icons are
  tight-cropped, ~0 px padding; SteamTurbine2's art is ~5×4.24 cells — over a cell taller than
  its 5×3 footprint — so forcing it into 5×3 squashes the exhaust up instead of letting it hang.)

**The website cannot fix this from the image alone** — a single cropped icon has no cell
reference, so we can't infer the scale or where the footprint sits within the overhang. (This
differs from connection sprites, where the all-connected state gives us a 1-cell reference.) We
measured: ~150 of 449 icons deviate from their footprint by >15% (68 by >30%) — it is systemic,
not a handful. The render scale clusters near ~208 px/cell but with a ±28% spread, so even the
*size* can't be inferred reliably.

### The contract: `uiImageRect` (DECIDED — the website already consumes it)

Emit, per building, the rendered PNG's rectangle **in cell units, relative to the footprint**:

```jsonc
// on each building.json bBuildingDefList[] entry; OMIT it to mean "image == footprint"
"uiImageRect": { "x": 0, "y": -1, "w": 5, "h": 4 }
```

- Coordinate space: the footprint occupies `(0,0)` (bottom-left) to `(widthInCells, heightInCells)`
  (top-right). `+x` right, `+y` up. Units = cells.
- `x, y` = bottom-left corner of the **image** in that space; `w, h` = image size in cells.
- Overhang is expressed by going outside the footprint: `y` negative ⇒ art hangs **below**
  (steam turbine exhaust); `x+w > widthInCells` ⇒ art extends **right**; etc.
- The rect describes the **whole PNG** (not just its opaque pixels). The PNG maps linearly onto
  the rectangle, so its pixel aspect must equal `w:h` — true automatically if you tight-crop.
- **Values are real numbers, not whole cells** — do *not* round to integers.
- **Example (verified in-editor):** SteamTurbine2, footprint 5×3, PNG 1033×876 at ~206 px/cell
  → `{ x: 0, y: -1.24, w: 5, h: 4.24 }` (≈1.24 cells of exhaust hanging below). A footprint-
  filling icon → `{ x:0, y:0, w:W, h:H }` (identical to omitting it).

This is the same information the 2020/2023 atlas carried as `pivot` + `realSize`.

#### How to compute it (export side)

You render each building's kanim to a tight-cropped PNG, so in one world frame you know the
**art's world bounding box** and the **footprint's position** (which cells it occupies). Let
`ppc` = your render scale in **pixels per cell**, and take the footprint's **bottom-left corner**
as the origin. Then:

```
w = imgPxW / ppc                      // image width in cells
h = imgPxH / ppc                      // image height in cells
x = (artLeft   - footprintLeft)   / cellSize   // cells the PNG's left edge sits right of the footprint's left
y = (artBottom - footprintBottom) / cellSize   // cells the PNG's bottom sits ABOVE the footprint's bottom
```

- **Watch the Y sign.** Our `+y` is **up**. Game/image space is usually `+y` down — if you compute
  in image space, flip the sign so a building whose art hangs *below* the footprint gets a
  **negative** `y` (as SteamTurbine2 does). This is the single most likely place to get it wrong.
- `x` is usually `0` and `w` usually equals the footprint width (most overhang is vertical), but
  emit the real measured values either way — side overhang (`x < 0` and/or `x+w > W`) happens too.
- Emit it for **every** building (even footprint-filling ones get their exact rect); omitting is
  only the legacy fallback.

**Website side is done and shipped:** the converter passes `uiImageRect` through to the DB, and
the renderer draws the icon into that rectangle (unit-tested). Buildings **without** it keep the
old stretch-to-footprint, so nothing regresses while you roll the field out. Watch the converter
log line `buildings with uiImageRect placement: N / 449` to track coverage.

---

## What the script does (for reference)

1. Reads `building.json`, `elements.json`, `uiSpriteInfo.json`; maps them to the website's
   internal shape (field renames, `viewMode` hash → overlay, flat-icon model, build menu).
2. Detects connectables (a `connection_sprites/<prefabId>/` dir exists) and **measures** each
   one's scale factor from `15.png`.
3. Writes `database-2024.json` + two `database-2024.zip` files.
4. Mirrors `ui_image/` and `connection_sprites/` into both served asset roots (`assets/` and
   `frontend/src/assets/`), replacing the targets so renamed/removed files don't linger.
   `ui_image_facade/` is not copied.
5. Validates and exits non-zero if anything is incomplete (missing icon, a connection dir
   missing one of 0–15, a connectable that's neither tile nor utility, etc.).

It's repeatable; re-running on the same export is safe (only the `.zip` bytes differ run-to-run).

---

## Contract — don't break these (everything else can change freely)

1. **Icon naming:** `ui_image/<prefabId>.png`, filename == `building.json` `name`. (An older
   doc said icons are named by display name — reality is prefabId; that's what we rely on.)
2. **Connection sprites:** all 16 of `0–15` present, bitmask `left=1/right=2/up=4/down=8`.
3. **Connectable signal:** the `connection_sprites/<prefabId>/` directory exists.
4. **Connection-sprite geometry:** the two framing rules in the resolution section above
   (shared canvas/registration across the 16; state 15 = one cell, centred).
4b. **`ui_image` framing:** tight-cropped animation icons require a per-building **`uiImageRect`**
   (cells, footprint-relative — see the framing section). Omit it only for icons whose art *is*
   the footprint. The website already consumes it; you just need to emit it.
5. **Building fields we read** keep their names/shapes: `name`, `nameString`, `isFoundation`,
   `isKAnimTile`, `isUtility`, `widthInCells`, `heightInCells`, `sceneLayer`, `objectLayer`,
   `viewMode`, `permittedRotations`, `dragBuild`, `buildLocationRule`, `materialCategory`,
   `materialMass`; plus top-level `bBuildingDefList`, `buildMenuCategories`,
   `buildingAndSubcategoryDataPairs`, `buildVersion`. Adding fields is safe.

We also inject a few overlay sprites of our own (`element_tile_back`, `*_tile_front`,
`info_back`, `info_front_0..11`) — don't try to provide these.

---

## Open questions back to the export

- **`ui_image_facade/` (988 files):** unused by us. Drop it to shrink the handoff, or tell us
  what it's for and we'll wire it.
- **10 of 13 JSONs unused** (`db, recipe, tags, attribute, po_string, entities, multiEntities,
  food, geyser, items`): intentional/future, or trim? (`po_string` is the likely next one we'd
  want, for i18n.)
- **Higher-res `ui_image`:** if any icon will exceed ~5 MB, tell us so we raise the test bound
  ahead of time.
- **`ui_image` framing (ACTIVE — your next export task):** decided to go with full per-building
  placement. **Emit `uiImageRect` (cells, footprint-relative) for every building** (≈150 deviate,
  the rest can omit it / set it to the footprint). Website consumption is already shipped and
  unit-tested; the converter logs `buildings with uiImageRect placement: N / 449` so you can
  track rollout. This revives the `pivot`/`realSize` your renderer already computes.
