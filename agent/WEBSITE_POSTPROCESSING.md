# Website Post-Processing Contract (blueprintnotincluded ← OniExtract2024)

**Direction:** website → export. This is the website telling the export maintainer exactly
what we do with an export drop, so the two repos stay in sync and never drift into a wacky
state. Pair it with `EXPORT_SCHEMA.md` / `WEBSITE_MIGRATION.md` (export → website).

**One command does everything on our side:** `npm run import:2024` (drop a fresh export into
`./export`, run it). It is repeatable — re-running on the same export is safe. It is *not*
byte-idempotent (the rebuilt `.zip`s differ run-to-run), but the meaningful outputs
(`database-2024.json`, the synced PNGs, the measured scales) are deterministic.

---

## 1. What we read, ignore, and derive

**Read (the only inputs we consume today):**
- `database/building.json` — buildings, build menu, categories, build version.
- `database/elements.json` — `elementTable`.
- `database/uiSpriteInfo.json` — **existence-checked only** (we warn if a building has no
  entry); we do not otherwise read its contents.
- `ui_image/<prefabId>.png` — one flat icon per building.
- `connection_sprites/<prefabId>/<0..15>.png` — 16 per connectable.

**Ignored today (shipping them is harmless; we just don't read them):**
`db.json`, `recipe.json`, `tags.json`, `attribute.json`, `po_string.json`, `entities.json`,
`multiEntities.json`, `food.json`, `geyser.json`, `items.json`, and the entire
`ui_image_facade/` folder. → *See open questions (§5).*

**Derived by us (not in the export — do not try to provide these):**
- `connectionScale` per connectable (measured from the sprites, see §3.3).
- Whether a building is "connectable" (presence of its `connection_sprites/` dir).
- A handful of handcrafted overlay sprites (see §4).

---

## 2. The pipeline (`app/api/batch/convert-export-2024.ts`)

1. **Map buildings.** Each `bBuildingDefList[]` entry → our building record. Field mapping:
   | our field | from export | note |
   |---|---|---|
   | `prefabId` | `name` | lookup key, also the icon/sprite filename |
   | `name` | `nameString` | display name (rich-text kept) |
   | `isTile` | `isFoundation \|\| isKAnimTile` | |
   | `isUtility` | `isUtility` | |
   | `sizeInCells` | `widthInCells`,`heightInCells` | |
   | `sceneLayer`,`objectLayer`,`permittedRotations`,`dragBuild`,`buildLocationRule` | same | |
   | `materialCategory`,`materialMass` | same | |
   | `viewMode` | `viewMode` (Klei HashedString hex) → our `Overlay` enum | hash table in the converter |
   | `uiImage`,`textureName`,`kanimPrefix` | `name` | flat-icon model |
   | `sprites.spriteNames` | — | always `[]` (no atlas in 2024) |
2. **Elements.** `elementTable` dict → array (`name,id,tag,oreTags,buildMenuSort,color,conduitColor,uiColor`).
3. **Build menu.** `buildMenuCategories` + `buildingAndSubcategoryDataPairs` (dict-of-pairs) → flat menu items.
4. **Connection sprites.** Detect connectables (dir presence), measure `connectionScale` (§3.3),
   set `connectionSprites: true`.
5. **Overlay sprites.** Inject our handcrafted overlay sprites + modifiers (§4).
6. **Write** `assets/database/database-2024.json` + `database-2024.zip` (backend) +
   `frontend/src/assets/database/database-2024.zip`.
7. **Sync assets.** Mirror `ui_image/` and `connection_sprites/` into `assets/` **and**
   `frontend/src/assets/` (replacing the targets so renamed/removed files don't linger).
   `ui_image_facade/` is **not** synced.
8. **Validate + exit non-zero** if anything is incomplete (missing icon, connectable that's
   neither tile nor utility, a connection dir missing one of 0–15, etc.).

---

## 3. Render-time processing (what the editor does with the data)

3.1 **Flat icons (build/select menu + non-connectable placements):** the single
`ui_image/<prefabId>.png` is drawn at the building footprint (w×100 px), bottom-anchored. Never
tiled, so exact icon size doesn't matter.

3.2 **Connection bitmask.** For connectables, the editor picks one of the 16 states by a 4-bit
mask **`left=1, right=2, up=4, down=8`** (matches the export's `UtilityConnections`). Utilities
read the mask from the saved blueprint; tiles compute it from same-type orthogonal neighbours.

3.3 **Connection-sprite scaling (the important one).** The exported PNGs frame one cell plus
optional cap/overhang, so a canvas is not necessarily one cell. We compute, per connectable:
`scale = canvas_px / cell_px`, where `cell_px` = the opaque bounding box of the **all-connected
state (`15.png`)**. We then render every state **center-anchored** at `100 × scale` so the cell
maps to our 100 px tile and neighbours join flush. This auto-adapts to whatever framing you use
(an earlier export measured ~1.5×, a later re-export ~1.0×) — **we never hardcode it.**

---

## 4. What we add that is NOT from the export

We inject these overlay sprites + sprite-modifiers ourselves (handcrafted PNGs in
`assets/images/`, referenced by the DB): `element_tile_back`, `gas_tile_front`,
`liquid_tile_front`, `vacuum_tile_front`, `info_back`, `info_front_0..11`. The export does not
provide them; please don't.

---

## 5. The contract — invariants the export MUST hold (break these → wacky state)

1. **Icon naming:** `ui_image/<prefabId>.png`, where `<prefabId>` == `building.json` `name`.
   (Note: an old `WEBSITE_MIGRATION.md` said icons are named by *display name* — reality is
   prefabId, and that's what we rely on.)
2. **Connection sprites:** `connection_sprites/<prefabId>/<bitmask>.png`, all 16 of 0–15
   present, with bitmask `left=1/right=2/up=4/down=8`.
3. **Connectable signal:** presence of the `connection_sprites/<prefabId>/` dir (you omit
   `tileableLeftRight`/`tileableTopBottom`, which is fine — we don't need them).
4. **Connection-sprite geometry (critical for §3.3):**
   - All 16 states of a building share **one canvas size** and **one cell registration**
     (same center, same pixels-per-cell) — your "single shared window" already does this.
   - In the **all-connected state (15)**, the opaque content must equal **exactly one cell,
     centered**. We measure pixels-per-cell from it. Overhang on *disconnected* sides in other
     states is fine (it bleeds past the cell). Overhang on **state 15** would corrupt our scale.
5. **Building fields we read** (see §2 table) must keep their names/shapes. Adding fields is
   safe; renaming/removing the ones we read is not.

Everything else about the export can change freely without touching the website.

---

## 6. Open questions back to the export (optional simplifications)

- **`ui_image_facade/` (988 files):** unused by us. Stop shipping it to shrink the handoff, or
  tell us what it's for and we'll wire it.
- **10 of 13 JSONs unused** (`db, recipe, tags, attribute, po_string, entities, multiEntities,
  food, geyser, items`): confirm they're future-facing / intentional, or trim the handoff.
  (`po_string` is the likely next one we'd want, for i18n.)
- **`connectionScale`:** we *measure* it, so you don't need to emit it. Only relevant if you
  ever want to bake overhang into the all-connected state — then invariant §5.4 breaks and we'd
  need you to emit pixels-per-cell instead. Current setup needs nothing from you.
- **`uiSpriteInfo.json`:** we only existence-check it. If it's expensive to produce and nothing
  else needs it, we could drop even that check.
