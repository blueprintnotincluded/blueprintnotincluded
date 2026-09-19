# Replace every X with Y — design note

Issue #14, option (d): the Factorio upgrade-planner idea. Select all Cobalt pipes, replace
them with Copper. Status: **design only, no code**. Decisions marked ⚠ are Kevin's.

## What exists today

- The Select Tool groups the selection into `SameItemCollection`s, one per building type
  (`OniItem`). Each group's `item-collection-info` panel has a `buildable-element-picker`;
  picking an element calls `BlueprintItem.setElement()` on **every item in that group** and
  emits one `blueprintChanged` per group. That is already a material swap, with two gaps:
  1. It is per group. A box selection with pipes, bridges and valves all in Cobalt takes three
     picks and produces three undo steps.
  2. It is unconditional. A group whose items are mixed (say Cobalt and Copper pipes,
     `nbElements[slot] > 1`) gets **all** of them set, not just the Cobalt ones.
- The Element Report lists every element in the blueprint with a "select every building made
  of X" button (`SelectTool.selectEveryElement`), which produces exactly the selection the
  upgrade-planner flow starts from.
- Undo is a snapshot per `blueprintChanged` (`BlueprintService.blueprintChanged`, 50 deep).
  `Blueprint.pauseChangeEvents()` / `resumeChangeEvents(true)` already exist to batch edits
  into one snapshot (used by `Blueprint.destroyAndCopyItems`, the load/undo-reload path).

So the feature is mostly a cross-group, conditional, single-undo-step version of a picker
that already exists, plus a place to put it.

## Scope

⚠ **Recommendation: v1 is a material swap only.** Building swap is a different feature with a
compatibility problem (below); shipping material swap first delivers the flow in the thread
(Cobalt → Copper) with no new invariants.

**Material swap** — for every selected item, for every material slot `i` whose current
element is X, set it to Y, provided Y is in `oniItem.buildableElementsArray[i]` for that
building. Items and slots not currently X are untouched. Buildings that cannot be made of Y
(a Plastic-only building when Y is Copper) are skipped and counted, never forced. Element
annotations (`OniItem.elementId` tiles painted with the paint tool) are excluded: they are
not built of anything.

**Building swap (v2, if wanted)** — replace building A with building B for every selected A.
Only safe inside a family with the same footprint, orientation set and utility ports, where
the item's `MdbBuilding` (position, orientation, element, temperature, connections bits)
transfers verbatim through `BlueprintHelpers.createInstance(B).importMdbBuilding(...)`:

| family | members |
|---|---|
| liquid pipe | `LiquidConduit`, `InsulatedLiquidConduit`, `LiquidConduitRadiant` |
| gas pipe | `GasConduit`, `InsulatedGasConduit`, `GasConduitRadiant` |
| wire | `Wire`, `WireRefined` (not `HighWattageWire`: different bridge and pass-through rules) |
| 1×1 tile | `Tile`, `InsulationTile`, `MetalTile`, `GlassTile`, `PlasticTile`, `CarpetTile`, `BunkerTile` |

⚠ A hand-authored allow-list of families (in lib, next to the settings catalogue) is the
honest rule. A generic "same width/height/orientations/ports" check would admit swaps that
look compatible in our model but not in the game (a Tile → Airflow Tile keeps footprint but
changes gas permeability). Deferred until Kevin wants it; nothing in v1 blocks it.

## Where the control lives

⚠ **Recommendation: a "Replace" strip in the Select Tool card**, above the group accordion,
shown only when the selection is non-empty:

```
Replace  [ Cobalt ▾ ]  with  [ Copper ▾ ]   [Apply]
         ^ elements present in the selection      ^ elements every affected slot can take
```

- The X dropdown lists the distinct elements found in the selection's material slots
  (computed from `SameItemCollection.items[*].buildableElements`). Preselected when the
  selection came from the Element Report's "select every X" button.
- The Y dropdown reuses `buildable-element-picker` (same icons, same category grouping).
  Elements that no affected building can take are omitted; elements some can take are shown
  with the skip count in the tooltip.
- Apply reports, in the same toast style as the rest of the editor: "Replaced Cobalt with
  Copper on 41 buildings (3 skipped: Plastic Ladder cannot be made of Copper)".

Rejected: putting the control on each Element Report line. The report is a whole-blueprint
view; a replace there would silently mean "everywhere" and would bypass the selection the
user can see outlined on the canvas. Keeping it on the selection means box-select and
select-every-X both work, and what is affected is always what is highlighted.

## Undo

One step, always. Apply wraps the loop in `blueprint.pauseChangeEvents()` …
`resumeChangeEvents(true)`, so exactly one `blueprintChanged` fires and `BlueprintService`
takes exactly one snapshot, whatever the number of groups touched. The per-group picker's
one-step-per-group behaviour is unchanged. After apply the selection is re-collected
(`SelectTool.selectAllLike`/`selectEveryElement` semantics), so the accordion counts and
`nbElements` reflect the new state, and the Element Report refreshes through its existing
`blueprintChanged` observer. `rawSource` freshness is invalidated by the existing MDB
fingerprint comparison; no new invalidation code.

## Per-building settings (`buildingData`)

**Material swap: untouched, by construction.** `buildingData` is keyed by ONI component
class (`Switch`, `LogicTimerSensor`, …), and no component's settings depend on the
construction material. `setElement()` does not read or write it. Nothing to decide.

**Building swap (v2):** carry over an entry only when the settings catalogue says the key
applies to the target prefab (`resolveSettingDescriptors(targetId, key)` is non-empty, or the
key is one the target could create from scratch, `creatableSettingsKeysFor(targetId)`).
Everything else is dropped and counted in the apply toast ("2 settings dropped: Door on
Insulated Tile"). Never synthesize defaults for the target: the mod's `TryApplyData` bails on
a whole Value object if a field is missing, so a guessed object is worse than none. Within
the families above this is moot in practice (conduits, wires and tiles carry no catalogued
settings), which is another reason to keep the family list narrow.

## Not in scope

- Replacing across the whole blueprint without a selection (use select-every-X first).
- Temperature changes as part of a replace (the temperature picker already batches per group).
- Replacing pipe **contents** (`pipeElement`) — a different picker, a different field.

## Decisions needed before code

1. v1 = material swap only? (recommended yes)
2. Control in the Select Tool card, acting on the current selection? (recommended yes)
3. If building swap is wanted later: allow-listed families, or generic compatibility check?
   (recommended families)
