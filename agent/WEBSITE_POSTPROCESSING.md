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
- The **animation/tight-crop export** crops to the art's true bounding box, which (a) has a
  different aspect ratio than the footprint and (b) includes art that **overhangs** the
  footprint. Stretching that into the footprint box squishes the aspect and crushes the
  overhang. (Measured: new icons are tight-cropped, ~0 px padding; e.g. SteamTurbine2 art is
  ar 1.30 but its footprint is 5×3 = ar 1.67.)

**The website cannot fix this from the image alone** — a single cropped icon has no cell
reference, so we can't infer the scale or where the footprint sits within the overhang. (This
differs from connection sprites, where the all-connected state gives us a 1-cell reference.)

**What we need the export to emit, per building, to use animation-framed icons** (this is the
`pivot`/`realSize` data the 2023 atlas had and the 2024 flat-icon collapse dropped). Either form:
- **(A) pixels-per-cell + pivot:** the render scale, and the pixel in the image that sits at the
  building's placement anchor (e.g. bottom-left cell corner). We then render at
  `imgPx / pixelsPerCell × 100` and position by the pivot; overhang extends naturally.
- **(B) image bounds in cells:** the image's rectangle in cell units relative to the footprint
  origin, e.g. `{ left, top, right, bottom }` where the footprint is `(0,0)–(w,h)` and the image
  may exceed it (overhang). We render at `(right-left)×100 by (bottom-top)×100` at that offset.

Either is a small, one-time website change on our side (swap the footprint-stretch for
scale+offset). **Until that metadata exists, the only way to keep icons correct is the old
framing: crop/pad `ui_image` to the footprint box (no overhang).** That keeps the turbine from
squishing but also won't let it hang below — overhang requires the metadata above.

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
4b. **`ui_image` framing:** either keep icons framed to the footprint (content == footprint box,
   like the old UI sprites), **or** ship per-building placement metadata (pixels-per-cell +
   pivot, or image-bounds-in-cells) so we can place animation-framed art. You can't switch to
   tight-cropped animation renders *without* the metadata — see the framing section.
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
- **`ui_image` framing (ACTIVE — blocking the high-res icons):** the animation-based render
  tight-crops to true art bounds, which breaks our footprint-stretch (squish + lost overhang).
  Decide: (A) emit per-building `pixels-per-cell` + `pivot` (or image-bounds-in-cells) and we
  do the matching render change, or (B) keep framing icons to the footprint (high-res but no
  overhang). (A) is the better long-term answer and revives the building's real geometry.
