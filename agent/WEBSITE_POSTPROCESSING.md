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
drawn scaled to the building's footprint (1 tile = 100 px on screen). It is **never tiled
against anything**, so its on-screen size is fixed by the footprint, not by the file.

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
- We scale every icon to the building footprint regardless of the file's pixel size. A bigger
  source PNG just means a sharper downscale. **Ship them as large as you like.**
- *Only caveat:* one test asserts each flat-icon PNG is **under 5 MB**. Realistically an icon
  won't approach that, but if a huge one does, ping us and we bump the limit (one line).
- No script change. No framing rules. Just higher-res pixels.

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
that breaks rule 2 above, or you start shipping `ui_image` at a size that trips the 5 MB test.
Pure "same framing, more pixels" = zero changes on our side.

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
