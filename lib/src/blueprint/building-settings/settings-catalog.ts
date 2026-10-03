import { THRESHOLD_SENSORS, thresholdSensorSpec } from './threshold-sensors';
import { OniItem } from '../../oni-item';
import { BuildingSettingsInfo } from '../../b-export/b-building';

// Curated catalogue of the BlueprintsV2 `buildingData` component keys we
// know how to display (and, from phase 3, edit) — spec/building-settings-plan.md
// "Automation keys in scope" table, verified against
// spec/blueprintsv2-import-spec.md §3. Every other `Key` a file may carry
// (`Door`, `Valve`, filters, `AccessControl`, `PixelPack`, skins, ...) is
// preserved opaquely and never reaches this table in v1.

// 'cycleFraction': a 0-1 fraction of a 600s in-game cycle (LogicTimeOfDaySensor),
// displayed as a percentage. 's': seconds, with a cycle count appended for long
// durations. 'bit': a 0-3 ribbon bit index. '%': a plain percentage, reserved.
export type SettingUnit = 's' | 'cycleFraction' | 'bit' | '%';

export type SettingFieldType =
  | 'bool'
  | 'float'
  | 'int'
  | 'string'
  | 'enum'
  | 'element'
  | 'tagSet';

export interface SettingFieldDescriptor {
  // Property name inside the component's `Value` object.
  field: string;
  // Display label. Plain English text in v1 — the site's chrome (this
  // included) ships English-only; see spec/search-followups.md's "UI
  // localization state".
  labelKey: string;
  type: SettingFieldType;
  unit?: SettingUnit;
  min?: number;
  max?: number;
  // type: 'enum' only. Keyed by the raw stored integer.
  enumLabels?: Record<number, string>;
  // Preserved and round-tripped, never shown or offered for edit. Only
  // `LogicTimerSensor.timeElapsedInCurrentState` today — a runtime value the
  // mod's TryApplyData still requires present in a written Value object.
  hidden?: boolean;

  // Affine stored <-> display conversion, for fields whose stored value is a
  // raw sim number rather than what the game showed the player:
  //   display = stored * displayScale + displayOffset
  // Both default to the `unit`-derived legacy behaviour (see displayScaleOf)
  // when absent, so a descriptor that sets neither is unchanged.
  displayScale?: number;
  displayOffset?: number;
  // Literal suffix rendered after the input ('g', '°C', 'lux', ...). When
  // absent the UI falls back to the symbol implied by `unit`.
  unitSuffix?: string;
  // Display-space rounding and input step.
  decimals?: number;
  step?: number;
  // type: 'bool' only. A boolean that is really a two-way choice rather than
  // an on/off switch — rendered as a pair of labelled options instead of a
  // checkbox, and formatted with these words instead of On/Off.
  booleanLabels?: { whenTrue: string; whenFalse: string };
  // type: 'bool' only. The stored field means the opposite of the checkbox the
  // player saw, so display and edit both negate it. `Automatable.automationOnly`
  // is the case: the game's side screen offers "Allow Manual Use", which is on
  // exactly when automationOnly is false.
  invert?: boolean;
  // The stored field is a JSON *string* of an object rather than the value itself
  // (`Prioritizable.masterPrioritySetting` is
  // "{\"priority_class\":0,\"priority_value\":9}"), and this descriptor reads and
  // writes ONE property of it. Every other property is kept verbatim on write. Go
  // through readSettingField/writeSettingField rather than indexing the Value.
  jsonProperty?: string;
  // jsonProperty only. The row is offered only while another property of the same
  // serialized object holds this value; otherwise the entry is preserved and not
  // shown, exactly like a field the Value lacks.
  jsonGuard?: { property: string; equals: number | string | boolean };
  // type: 'element' only. The `forceTag` passed to app-cell-element-picker
  // (`Gas`/`Liquid`/`Solid`) — filled in per prefab by resolveSettingDescriptors
  // from FILTERABLE_BUILDINGS, since one `Filterable` catalogue entry serves
  // buildings of every phase.
  elementForceTag?: string;
}

// The above/below choice every threshold sensor carries. It is a direction,
// not an on/off state, so a checkbox labelled "Activate above threshold" makes
// the reader negate it in their head to understand "below"; the game's own
// side screen shows the two directions side by side.
const ABOVE_BELOW: Pick<SettingFieldDescriptor, 'labelKey' | 'type' | 'booleanLabels'> = {
  labelKey: 'Active',
  type: 'bool',
  booleanLabels: { whenTrue: 'Above', whenFalse: 'Below' },
};

// Door.ControlState, the game's own enum order: Auto, Opened, Locked. The words
// are the three states the door side screen offers
// (UI.UISIDESCREENS.DOOR_TOGGLE_SIDE_SCREEN.AUTO / .OPEN / .CLOSE -- "Door is
// locked"). The real mod export in __tests__/fixtures stores 0 on its Mechanized
// Airlock.
export const DOOR_STATE_AUTO = 0;
const DOOR_STATE_LABELS: Record<number, string> = {
  [DOOR_STATE_AUTO]: 'Auto',
  1: 'Open',
  2: 'Locked',
};

// PriorityScreen.PriorityClass.basic -- the ordinary 1-9 scale. The other classes
// (urgent, personal needs, the yellow-alert "top priority", involuntary) reuse
// priority_value with a different meaning, so the 1-9 row is offered for this one
// alone.
const PRIORITY_CLASS_BASIC = 0;

const THRESHOLD_KEY = 'IThresholdSwitch';
const PRIORITIZABLE_KEY = 'Prioritizable';
const DOOR_KEY = 'Door';
const VALVE_KEY = 'Valve';
const LIMIT_VALVE_KEY = 'LimitValve';
const USER_CAPACITY_KEY = 'IUserControlledCapacity';
const FILTERABLE_KEY = 'Filterable';
const TREE_FILTERABLE_KEY = 'TreeFilterable';

// Buildings whose accepted-materials filter we can create from scratch. Kept
// narrow on purpose: the *default* is verified (see below), but whether a given
// prefab carries a TreeFilterable component at all is a per-building fact, and
// writing the key onto a building without one would render an editable row for
// a setting the mod then ignores. Extend it as captures confirm more carriers;
// an imported blueprint's filter is editable on ANY carrier already, since that
// path needs the key to be present rather than created.
export const TREE_FILTERABLE_BUILDINGS: string[] = ['SolidConduitInbox', 'StorageLockerSmart'];

// The Critter Sensor. Handled like a threshold sensor (its own Key is the
// single canonical settings key; the stowaway Switch and a redundant
// IThresholdSwitch echo are both suppressed) but kept out of THRESHOLD_SENSORS
// because it needs no unit conversion and its IThresholdSwitch is suppressed
// rather than rewritten. See threshold-sensors.ts.
export const CRITTER_COUNT_SENSOR_ID = 'LogicCritterCountSensor';

// Buildings whose one editable setting is the mod's `Filterable` key — a single
// element chosen from a picker. The 5 element sensors detect the chosen element;
// the 2 filters divert it. Value maps 1:1 to the picker's `forceTag`
// (Gas/Liquid/Solid), which is fixed per prefab in the game's own config
// (Filterable.filterElementState), not a user choice. The stored SelectedTag is
// an element id string ("Oxygen"); NONE_TAG ("Void") is "nothing selected".
export const NONE_TAG = 'Void';
//
// The list is every `Filterable` carrier the game declares that also exists in
// database-2024.json, taken from the Configs rather than guessed from names:
// each one's phase is the `filterElementState` its own Config assigns. The
// decompile has eleven Configs assigning it, plus `DevPump`, which extends
// Filterable and assigns `filterElementState = this.elementState` on spawn.
// `elementSensorFilterableCarriers` in the spec walks the shipped database
// against this table so a future import cannot quietly add a carrier we then
// render with the wrong element pool.
export const FILTERABLE_BUILDINGS: Record<string, string> = {
  LogicElementSensorGas: 'Gas',
  LogicElementSensorLiquid: 'Liquid',
  GasConduitElementSensor: 'Gas',
  LiquidConduitElementSensor: 'Liquid',
  SolidConduitElementSensor: 'Solid',
  GasFilter: 'Gas',
  LiquidFilter: 'Liquid',

  // Missed when this table first shipped (#244). Without an entry a building
  // still shows an Element row -- the catalogue has the `Filterable` key -- but
  // the picker falls back to the default Gas/Liquid pool and there is no Set
  // button, because the creatable-key registration below only walks this table.
  // A Solid Filter was therefore unsettable and offered the wrong elements.
  SolidFilter: 'Solid',
  RocketInteriorGasOutput: 'Gas',
  RocketInteriorLiquidOutput: 'Liquid',
  RocketInteriorSolidOutput: 'Solid',

  // DevPump{Gas,Liquid,Solid}. Debug buildings, and included deliberately:
  // `DebugOnly` is not `Deprecated` -- the game reveals these in a debug build
  // menu rather than hiding them everywhere (BuildingDef: `!Deprecated &&
  // (!DebugOnly || Game.Instance.DebugOnlyBuildingsAllowed)`) -- and this site's
  // build menu offers them unconditionally, so a blueprint here can already
  // contain one. They carry a real phase: DevPump.OnSpawn assigns
  // `filterElementState = this.elementState`, which each Config sets.
  DevPumpGas: 'Gas',
  DevPumpLiquid: 'Liquid',
  DevPumpSolid: 'Solid',
};

export function filterableBuildingForceTag(prefabId: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(FILTERABLE_BUILDINGS, prefabId)
    ? FILTERABLE_BUILDINGS[prefabId]
    : undefined;
}

// Sensors extend `Switch`, so a copied one carries a stowaway `switchedOn`
// holding its sampled output — never a setting. True for every threshold
// sensor, the critter sensor, and the element sensors (the 2 filters have no
// Switch, so this is a harmless no-op for them).
function suppressesStowawaySwitch(prefabId: string): boolean {
  return (
    thresholdSensorSpec(prefabId) != null ||
    prefabId == CRITTER_COUNT_SENSOR_ID ||
    filterableBuildingForceTag(prefabId) != null
  );
}

// Keyed by the component `Key` (nameof the ONI component class — the mod's
// own registry, API_Methods.cs RegisterVanillaBuildings()).
export const SETTINGS_CATALOG: Record<string, SettingFieldDescriptor[]> = {
  Switch: [{ field: 'switchedOn', labelKey: 'On', type: 'bool' }],

  LogicTimerSensor: [
    { field: 'onDuration', labelKey: 'On duration', type: 'float', unit: 's', min: 0 },
    { field: 'offDuration', labelKey: 'Off duration', type: 'float', unit: 's', min: 0 },
    {
      field: 'timeElapsedInCurrentState',
      labelKey: 'Time elapsed in current state',
      type: 'float',
      unit: 's',
      hidden: true,
    },
    { field: 'displayCyclesMode', labelKey: 'Display in cycles', type: 'bool' },
  ],

  // Verified in game (issue #238): both fields are a 0-1 fraction of the cycle,
  // not seconds into it as a secondhand buildingData reference claimed. Set to
  // 30% / 15% on the side screen, a copy exports startTime 0.2966114 and
  // duration 0.151766792; seconds would have stored 180 and 90. The percentage
  // display below is therefore correct as it stands.
  LogicTimeOfDaySensor: [
    { field: 'startTime', labelKey: 'Start time', type: 'float', unit: 'cycleFraction', min: 0, max: 1 },
    { field: 'duration', labelKey: 'Duration', type: 'float', unit: 'cycleFraction', min: 0, max: 1 },
  ],

  LogicCounter: [
    { field: 'maxCount', labelKey: 'Target count', type: 'int', min: 1, max: 10 },
    { field: 'resetCountAtMax', labelKey: 'Reset at target', type: 'bool' },
    { field: 'advancedMode', labelKey: 'Advanced mode', type: 'bool' },
  ],

  LogicGateBuffer: [
    { field: 'DelayAmount', labelKey: 'Delay', type: 'float', unit: 's', min: 0 },
  ],
  LogicGateFilter: [
    { field: 'DelayAmount', labelKey: 'Delay', type: 'float', unit: 's', min: 0 },
  ],

  LogicRibbonReader: [
    { field: 'selectedBit', labelKey: 'Bit', type: 'int', unit: 'bit', min: 0, max: 3 },
  ],
  LogicRibbonWriter: [
    { field: 'selectedBit', labelKey: 'Bit', type: 'int', unit: 'bit', min: 0, max: 3 },
  ],

  LogicCritterCountSensor: [
    // RangeMin 0 / RangeMax 64 — read off the decompiled LogicCritterCountSensor
    // and since confirmed against a sandbox game (soft, like every threshold
    // sensor bound: the setter does not enforce it).
    { field: 'countThreshold', labelKey: 'Threshold', type: 'int', min: 0, max: 64 },
    { field: 'activateOnGreaterThan', ...ABOVE_BELOW },
    { field: 'countCritters', labelKey: 'Count critters', type: 'bool' },
    { field: 'countEggs', labelKey: 'Count eggs', type: 'bool' },
  ],

  // Element sensors and Gas/Liquid Filter. One element id string; the picker's
  // phase filter is set per prefab by resolveSettingDescriptors (elementForceTag).
  Filterable: [{ field: 'SelectedTag', labelKey: 'Element', type: 'element' }],

  // The accepted-materials filter, carried by the Conveyor Loader, the Smart
  // Storage Bin and every other storage building the mod can copy. Unlike
  // `Filterable` (one element) this is a *set*, and it is stored serialized —
  // see decodeTagSet/encodeTagSet.
  //
  // The mod applies these two fields independently (two separate null checks in
  // DataTransfer_TreeFilterable), so unlike almost every other key a Value
  // missing one of them still applies the other. That makes it the second
  // exception to the "TryApplyData bails on the whole Value" rule, alongside
  // LogicAlarm.
  //
  // Both labels come from the game's shipped strings rather than the C# field
  // names -- the mistake #251 fixed for the activation range.
  // `.ONLYALLOWTRANSPORTITEMSBUTTON` is "Sweep Only" ("Only store objects
  // marked Sweep in this container"), a very different thing from the "only
  // fetch marked items" its field name suggests.
  //
  // The tag set is shortened from the game's "Element Filter"
  // (TREEFILTERABLESIDESCREEN.TITLE) to just "Filter": the row sits inside a
  // panel that already has an Elements section for the building's construction
  // material, and two things called Element next to each other read as related
  // when they are not.
  TreeFilterable: [
    { field: 'acceptedTagSet', labelKey: 'Filter', type: 'tagSet' },
    { field: 'onlyFetchMarkedItems', labelKey: 'Sweep Only', type: 'bool' },
  ],

  LogicAlarm: [
    { field: 'notificationName', labelKey: 'Name', type: 'string', max: 200 },
    { field: 'notificationTooltip', labelKey: 'Tooltip', type: 'string', max: 400 },
    // Klei's NotificationType enum values are unverified here (spec §6 Q5) —
    // shown as a raw integer rather than guessing labels.
    { field: 'notificationType', labelKey: 'Notification type', type: 'int' },
    { field: 'pauseOnNotify', labelKey: 'Pause on notify', type: 'bool' },
    { field: 'zoomOnNotify', labelKey: 'Zoom on notify', type: 'bool' },
    { field: 'cooldown', labelKey: 'Cooldown', type: 'float', unit: 's', min: 0 },
  ],

  // Direction first: it frames the number that follows ("active above ... 1000 g"),
  // and it is the field a reader checks first when scanning a sensor.
  IThresholdSwitch: [
    { field: 'ActivateAboveThreshold', ...ABOVE_BELOW },
    { field: 'Threshold', labelKey: 'Threshold', type: 'float' },
  ],

  // Verified in game (issue #238) on all three carriers a copy can produce --
  // Smart Battery, Liquid Reservoir, Gas Reservoir. Each stores the side
  // screen's own numbers raw, 0-100, NOT normalised 0-1 as a secondhand
  // buildingData reference claimed: set high 80 / low 20, all three export
  // `ActivateValue: 80, DeactivateValue: 20`.
  //
  // The component's field names are inverted relative to what the player sees.
  // `ActivateValue` holds the HIGH threshold and `DeactivateValue` the LOW one,
  // so the catalogue's original "Activate value" label named 80 as the value
  // that turns the building on -- the opposite of what it does. The game's own
  // side screens say high/low on every carrier, so these are flat labels rather
  // than a per-prefab override through resolveSettingDescriptors.
  //
  // unitSuffix, not `unit: '%'`: the stored value is already 0-100, and `unit`
  // would put it through displayScaleOf's x100.
  IActivationRangeTarget: [
    {
      field: 'ActivateValue',
      labelKey: 'High threshold',
      type: 'float',
      unitSuffix: '%',
      min: 0,
      max: 100,
    },
    {
      field: 'DeactivateValue',
      labelKey: 'Low threshold',
      type: 'float',
      unitSuffix: '%',
      min: 0,
      max: 100,
    },
  ],

  BuildingEnabledButton: [{ field: 'IsEnabled', labelKey: 'Enabled', type: 'bool' }],

  // --- Keys whose bounds and units depend on the building. The entries below are
  // the unbounded fallback; resolveSettingDescriptors fills in the range the export
  // records for the prefab (OniItem.settings). ---

  // The build priority. Stored serialized, like TreeFilterable's tag set but an
  // object: masterPrioritySetting is "{\"priority_class\":0,\"priority_value\":9}".
  // Offered on the basic class only (see PRIORITY_CLASS_BASIC). 1-9 is the game's
  // own scale (UI.PRIORITYSCREEN.BASIC: "1: Least Urgent / 9: Most Urgent").
  [PRIORITIZABLE_KEY]: [
    {
      field: 'masterPrioritySetting',
      jsonProperty: 'priority_value',
      jsonGuard: { property: 'priority_class', equals: PRIORITY_CLASS_BASIC },
      labelKey: 'Priority',
      type: 'int',
      min: 1,
      max: 9,
    },
  ],

  [DOOR_KEY]: [
    { field: 'requestedState', labelKey: 'Door', type: 'enum', enumLabels: DOOR_STATE_LABELS },
  ],

  // Stored in kg/s, shown in g/s as the game's Flow Control screen shows it: a
  // Liquid Valve set to 4832 g/s exports DesiredFlow 4.832. The max comes from the
  // prefab (Gas Valve 1 kg/s, Liquid Valve 10 kg/s).
  [VALVE_KEY]: [
    {
      field: 'DesiredFlow',
      labelKey: 'Flow rate',
      type: 'float',
      unitSuffix: 'g/s',
      displayScale: 1000,
      decimals: 1,
      step: 10,
      min: 0,
    },
  ],

  // The Meter Valves. kg on the gas and liquid ones, a unit count on the Conveyor
  // Meter (displayUnitsInsteadOfMass); the max is the prefab's maxLimitKg.
  [LIMIT_VALVE_KEY]: [
    { field: 'Limit', labelKey: 'Limit', type: 'float', unitSuffix: 'kg', min: 0 },
  ],

  // The storage cap ("Storage Capacity Control", "Max:"). kg, critters or radbolts
  // depending on the building, which also sets the range and whether it is a whole
  // number. Carried by the Storage Tile too: its range comes from StorageTile.Def.
  [USER_CAPACITY_KEY]: [
    { field: 'UserMaxCapacity', labelKey: 'Max capacity', type: 'float', unitSuffix: 'kg', min: 0 },
  ],

  // The player-given name. No length bound: the string bound doubles as a
  // truncation on commit, and an untouched default name ("<link=...>Storage
  // Bin</link>", markup and all) must survive a blur unchanged.
  UserNameable: [{ field: 'savedName', labelKey: 'Name', type: 'string' }],

  // The game's side screen (AUTOMATABLE_SIDE_SCREEN.ALLOWMANUALBUTTON) says
  // "Allow Manual Use" -- "Allow Duplicants to manually manage these storage
  // materials" -- and it is ticked when the stored automationOnly is FALSE. So
  // the row is both renamed and negated; showing the raw field would have the
  // player read every value backwards.
  Automatable: [
    { field: 'automationOnly', labelKey: 'Allow Manual Use', type: 'bool', invert: true },
  ],
};

// A Klei tag as the mod serializes it. `IsValid` is a get-only property on the
// C# side, so only `Name` survives the trip back into a Tag — we write `true`
// because that is what the game itself emits, not because it is read.
export interface SettingTag {
  Name: string;
  IsValid: boolean;
}

// `acceptedTagSet` is stored *serialized*, as a JSON string:
//
//   "acceptedTagSet": "[{\"Name\":\"HatchEgg\",\"IsValid\":true}]"
//
// The mod writes it with `JsonConvert.SerializeObject(tags)` and reads it back
// with `t1.Value<string>()`, so the string is the only form it applies. We read
// and write that form alone.
//
// Never throws: a malformed value reads as an empty set rather than breaking
// the settings panel, matching how formatBuildingDataEntry treats a field whose
// shape it does not recognize.
export function decodeTagSet(raw: unknown): SettingTag[] {
  if (typeof raw != 'string' || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const names: string[] = [];
  for (const entry of parsed) {
    const name =
      typeof entry == 'string'
        ? entry
        : entry != null && typeof (entry as SettingTag).Name == 'string'
          ? (entry as SettingTag).Name
          : null;
    // A set, as the name says: the mod parses it into a HashSet<Tag>, so a
    // duplicate would silently collapse there anyway.
    if (name != null && name !== '' && !names.includes(name)) names.push(name);
  }
  return names.map(Name => ({ Name, IsValid: true }));
}

export function encodeTagSet(tags: readonly SettingTag[]): string {
  return JSON.stringify(tags.map(tag => ({ Name: tag.Name, IsValid: true })));
}

// The object a jsonProperty descriptor's field serializes, or null when the stored
// string is absent or not an object. Never throws.
function parseSerializedObject(raw: unknown): Record<string, any> | null {
  if (typeof raw != 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed != null && typeof parsed == 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// The value a descriptor shows, read out of a buildingData `Value` object.
// `undefined` means "nothing to show for this descriptor": the field is missing,
// or -- for a jsonProperty descriptor -- the serialized object is malformed, lacks
// the property, or fails its guard. Callers treat undefined like a missing field:
// the entry is preserved and the row is not rendered.
export function readSettingField(
  descriptor: SettingFieldDescriptor,
  value: Record<string, any> | null | undefined
): any {
  if (value == null || typeof value != 'object' || !(descriptor.field in value)) return undefined;
  const raw = value[descriptor.field];
  if (descriptor.jsonProperty == null) return raw;

  const serialized = parseSerializedObject(raw);
  if (serialized == null || !(descriptor.jsonProperty in serialized)) return undefined;
  if (
    descriptor.jsonGuard != null &&
    serialized[descriptor.jsonGuard.property] !== descriptor.jsonGuard.equals
  )
    return undefined;
  return serialized[descriptor.jsonProperty];
}

// What to store in `Value[descriptor.field]` so that the descriptor reads back
// `next`. For an ordinary descriptor that is `next` itself; for a jsonProperty one
// it is the serialized object with that one property replaced and every other
// property (and their order) kept. Compact JSON, as Newtonsoft writes it.
export function writeSettingField(
  descriptor: SettingFieldDescriptor,
  value: Record<string, any> | null | undefined,
  next: any
): any {
  if (descriptor.jsonProperty == null) return next;
  const serialized = parseSerializedObject(value?.[descriptor.field]) ?? {};
  serialized[descriptor.jsonProperty] = next;
  return JSON.stringify(serialized);
}

const CAPACITY_UNIT_SUFFIX: Record<string, string> = {
  kg: 'kg',
  Critters: 'critters',
  Radbolts: 'radbolts',
};

// The static settings facts the export records for a prefab, or undefined when the
// game database is not loaded or does not know the prefab (a unit test, a modded
// building). Every caller falls back to the unbounded catalogue entry.
function buildingSettingsInfo(prefabId: string): BuildingSettingsInfo | undefined {
  return OniItem.oniItemsMap?.get(prefabId)?.settings;
}

// Fills in the range and unit a building gives one of the range-carrying Keys.
// Bounds stay in STORED units, like every other catalogue bound.
function withBuildingRange(
  prefabId: string,
  key: string,
  base: SettingFieldDescriptor[]
): SettingFieldDescriptor[] {
  const info = buildingSettingsInfo(prefabId);
  if (info == null) return base;

  if (key == VALVE_KEY && info.valve != null) {
    const max = info.valve.maxFlow;
    return base.map(d => (d.field == 'DesiredFlow' ? { ...d, max } : d));
  }

  if (key == LIMIT_VALVE_KEY && info.limitValve != null) {
    const { maxLimitKg, displayUnitsInsteadOfMass } = info.limitValve;
    return base.map(d =>
      d.field == 'Limit'
        ? {
            ...d,
            max: maxLimitKg,
            unitSuffix: displayUnitsInsteadOfMass ? 'units' : 'kg',
            ...(displayUnitsInsteadOfMass ? { type: 'int' as const } : {}),
          }
        : d
    );
  }

  if (key == USER_CAPACITY_KEY && info.userControlledCapacity != null) {
    const capacity = info.userControlledCapacity;
    return base.map(d =>
      d.field == 'UserMaxCapacity'
        ? {
            ...d,
            min: capacity.minCapacity,
            max: capacity.maxCapacity,
            type: capacity.wholeValues ? ('int' as const) : ('float' as const),
            // A unit the importer has never seen fails the import, so the raw
            // name here is a fallback that should not be reachable.
            unitSuffix: CAPACITY_UNIT_SUFFIX[capacity.units] ?? capacity.units,
          }
        : d
    );
  }

  // A door that cannot be automated (the Bunker Door) is not offered Auto. A
  // stored Auto is still shown: the panel adds the current value to the choices.
  if (key == DOOR_KEY && info.door != null && !info.door.allowAutoControl)
    return base.map(d => {
      if (d.field != 'requestedState' || d.enumLabels == null) return d;
      const enumLabels = { ...d.enumLabels };
      delete enumLabels[DOOR_STATE_AUTO];
      return { ...d, enumLabels };
    });

  return base;
}

const RANGED_KEYS = [VALVE_KEY, LIMIT_VALVE_KEY, USER_CAPACITY_KEY, DOOR_KEY];

export function isKnownSettingsKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(SETTINGS_CATALOG, key);
}

// The stored -> display multiplier for a descriptor. An explicit displayScale
// wins; otherwise the legacy unit-derived rule applies, where a 0-1 fraction
// (LogicTimeOfDaySensor) is edited as a 0-100 number to match the game's own
// side screen. Every other unit round-trips 1:1.
function displayScaleOf(descriptor: SettingFieldDescriptor): number {
  if (descriptor.displayScale != null) return descriptor.displayScale;
  return descriptor.unit == 'cycleFraction' || descriptor.unit == '%' ? 100 : 1;
}

export function toDisplayValue(descriptor: SettingFieldDescriptor, stored: number): number {
  return stored * displayScaleOf(descriptor) + (descriptor.displayOffset ?? 0);
}

export function toStoredValue(descriptor: SettingFieldDescriptor, display: number): number {
  return (display - (descriptor.displayOffset ?? 0)) / displayScaleOf(descriptor);
}

// The descriptors to render for one Key *on one building*. Identical to
// SETTINGS_CATALOG[key] except where the building changes what the Key means:
//
//  - `IThresholdSwitch` on a threshold sensor: the bare unitless `Threshold`
//    float becomes the quantity that building actually measures, with the
//    conversion and soft bounds from THRESHOLD_SENSORS.
//  - `Switch` on any sensor (threshold, critter, element): nothing. Sensors
//    extend Switch, so the mod's Switch handler matches them and a copied
//    sensor carries a stowaway `switchedOn` holding its sampled *output* at
//    copy time, which the game overwrites within ~1.8s. It round-trips, but it
//    is not a setting and must not be offered as one. The manual LogicSwitch is
//    not a sensor, so it keeps its editable row. (suppressesStowawaySwitch)
//  - `Filterable` on an element sensor or Gas/Liquid Filter: the picker's phase
//    filter (Gas/Liquid/Solid) is filled in from the prefab.
//  - `Valve`, `LimitValve`, `IUserControlledCapacity`, `Door`: the bounds, unit and
//    choices the export records for the prefab (withBuildingRange).
export function resolveSettingDescriptors(
  prefabId: string,
  key: string
): SettingFieldDescriptor[] {
  const catalogued = SETTINGS_CATALOG[key];
  if (catalogued == null) return [];

  if (key == 'Switch' && suppressesStowawaySwitch(prefabId)) return [];

  // Valve / LimitValve / IUserControlledCapacity / Door: the range, unit and
  // choices the export records for this prefab. Independent of the sensor
  // branches below, which only ever rewrite their own Keys.
  const base = RANGED_KEYS.includes(key)
    ? withBuildingRange(prefabId, key, catalogued)
    : catalogued;

  // Critter Sensor: its own Key is authoritative. `IThresholdSwitch` is a pure
  // echo — in the game source LogicCritterCountSensor.Threshold is
  // `get => countThreshold`. It round-trips but is not a setting to show.
  if (prefabId == CRITTER_COUNT_SENSOR_ID) {
    return key == THRESHOLD_KEY ? [] : base;
  }

  // Element sensors / Gas-Liquid Filter: fill the `Filterable` picker's phase
  // filter from the prefab.
  const forceTag = filterableBuildingForceTag(prefabId);
  if (forceTag != null) {
    if (key != FILTERABLE_KEY) return base;
    return base.map(descriptor =>
      descriptor.field == 'SelectedTag' ? { ...descriptor, elementForceTag: forceTag } : descriptor
    );
  }

  const spec = thresholdSensorSpec(prefabId);
  if (spec == null) return base;

  if (key != THRESHOLD_KEY) return base;

  return base.map(descriptor => {
    if (descriptor.field != 'Threshold') return descriptor;
    return {
      ...descriptor,
      labelKey: spec.label,
      unitSuffix: spec.unitSuffix,
      displayScale: spec.displayScale,
      displayOffset: spec.displayOffset,
      // min/max stay in STORED units, like every other catalogue bound — the
      // UI converts them through toDisplayValue alongside the value itself.
      min: spec.storedMin,
      max: spec.storedMax,
      decimals: spec.decimals,
      step: spec.step,
    };
  });
}

// Editing an already-present Key is offered for every entry in
// SETTINGS_CATALOG above. *Creating* a Key from scratch (a building placed in
// the editor, or an uploaded file that omitted it because it was all-default)
// is a narrower, hand-checked set: TryApplyData bails on the whole Value
// object if any one field is missing, so a synthesized object must supply
// every field with the real in-game default or it silently does nothing —
// and worse, a wrong guess for a gameplay-affecting field changes the
// building's behaviour versus leaving it absent.
//
// LogicTimerSensor, whose four fields are all either given
// (onDuration/offDuration: spec/building-settings-plan.md phase 3 step 1) or
// definitionally safe (timeElapsedInCurrentState: 0 for a fresh component;
// displayCyclesMode: a display-only toggle with no simulation effect even if
// the guessed default is wrong). Every other automation key — including
// LogicCounter, whose resetCountAtMax/advancedMode defaults are not
// confirmed — stays edit-only-when-present until its real defaults are
// verified in-game. Extend CREATABLE_SETTINGS then, per building prefab id.
//
// `IThresholdSwitch` on every threshold sensor is the second entry, and it is
// safe for the same reason: the handler reads exactly two fields and we write
// both, so there is no partial-Value hazard, and TryApplyData is guarded by
// TryGetComponent so a building that turns out not to carry the component
// simply ignores it. Without this the feature would only work on blueprints
// imported from the game — a sensor placed in the editor has no buildingData
// at all.
export const CREATABLE_SETTINGS: Record<string, Record<string, Record<string, any>>> = {
  LogicTimerSensor: {
    LogicTimerSensor: {
      onDuration: 10,
      offDuration: 10,
      timeElapsedInCurrentState: 0,
      displayCyclesMode: false,
    },
  },

  // All four values are the real defaults, read off the decompiled
  // LogicCritterCountSensor `[Serialize]` field initializers
  // (countEggs/countCritters/activateOnGreaterThan default true; countThreshold
  // is an int with no initializer, i.e. 0) and then **confirmed in a sandbox
  // game** on a freshly-placed sensor. That check is what qualifies this entry
  // under the rule above — a synthesized Value matches a fresh in-game sensor
  // exactly, rather than matching what the decompile implies it should.
  [CRITTER_COUNT_SENSOR_ID]: {
    [CRITTER_COUNT_SENSOR_ID]: {
      countThreshold: 0,
      activateOnGreaterThan: true,
      countCritters: true,
      countEggs: true,
    },
  },
};

for (const [prefabId, spec] of Object.entries(THRESHOLD_SENSORS)) {
  // Every prefab in THRESHOLD_SENSORS gets IThresholdSwitch as a creatable
  // key. (LogicCritterCountSensor is not among them — it's excluded from
  // THRESHOLD_SENSORS entirely; see threshold-sensors.ts for why.)
  const forPrefab = (CREATABLE_SETTINGS[prefabId] ??= {});
  forPrefab['IThresholdSwitch'] = {
    Threshold: spec.defaultThreshold,
    ActivateAboveThreshold: spec.defaultActivateAbove,
  };
}

// Confirmed in game rather than guessed, which is what CREATABLE_SETTINGS
// policy requires: a freshly built Conveyor Loader and Smart Storage Bin each
// store an empty accepted set with `onlyFetchMarkedItems: false`, and a loader
// whose filter panel was opened and closed without a selection stores exactly
// the same. So an empty set is the game's own default and creating the key
// changes nothing until the user picks a material.
for (const prefabId of TREE_FILTERABLE_BUILDINGS) {
  const forPrefab = (CREATABLE_SETTINGS[prefabId] ??= {});
  forPrefab[TREE_FILTERABLE_KEY] = { acceptedTagSet: '[]', onlyFetchMarkedItems: false };
}

for (const prefabId of Object.keys(FILTERABLE_BUILDINGS)) {
  // Every element sensor / filter gets `Filterable` as a creatable key. The
  // one field, SelectedTag, defaults to NONE_TAG ('Void') — the game's own
  // default, so creating the key on an editor-placed building changes nothing
  // until the user picks an element.
  const forPrefab = (CREATABLE_SETTINGS[prefabId] ??= {});
  forPrefab[FILTERABLE_KEY] = { SelectedTag: NONE_TAG };
}

// The Keys creatable from scratch on a specific building prefab id.
export function creatableSettingsKeysFor(prefabId: string): string[] {
  const forPrefab = CREATABLE_SETTINGS[prefabId];
  return forPrefab == null ? [] : Object.keys(forPrefab);
}

export function getCreatableSettingDefaults(
  prefabId: string,
  key: string
): Record<string, any> | undefined {
  return CREATABLE_SETTINGS[prefabId]?.[key];
}

// Some prefabs keep their settings under one canonical Key that the panel
// treats as pinned-vs-not: when it is absent the mod leaves the built building
// on the game's own defaults, which is a real state distinct from any stored
// value. Threshold sensors -> `IThresholdSwitch` (labelled by the measured
// quantity); the Critter Sensor -> its own Key; element sensors / filters ->
// `Filterable`. Anything else -> null (every present Key is just an editable row).
export function primarySettingsKey(
  prefabId: string
): { key: string; label: string } | null {
  if (prefabId == CRITTER_COUNT_SENSOR_ID)
    return { key: CRITTER_COUNT_SENSOR_ID, label: 'Critter count' };
  if (filterableBuildingForceTag(prefabId) != null)
    return { key: FILTERABLE_KEY, label: 'Element' };
  if (TREE_FILTERABLE_BUILDINGS.includes(prefabId))
    return { key: TREE_FILTERABLE_KEY, label: 'Filter' };
  const spec = thresholdSensorSpec(prefabId);
  return spec != null ? { key: THRESHOLD_KEY, label: spec.label } : null;
}

// The Critter Sensor's `IThresholdSwitch` entry (present on every in-game copy)
// echoes two fields of its own Key. An edit to the own Key must be mirrored
// onto an existing echo, or the mod's key-apply pass could overwrite the fresh
// value from the stale echo (IThresholdSwitch.TryApplyData sets
// countThreshold = (int)Threshold).
//
// prefabId -> the owning Key -> its field -> the echoed {key, field}. One table
// rather than a branch per accessor, so "which field mirrors where" and "which
// Keys are pure echoes of this one" cannot drift apart when a second carrier
// turns up.
const REDUNDANT_ECHOES: Record<
  string,
  Record<string, Record<string, { key: string; field: string }>>
> = {
  [CRITTER_COUNT_SENSOR_ID]: {
    [CRITTER_COUNT_SENSOR_ID]: {
      countThreshold: { key: THRESHOLD_KEY, field: 'Threshold' },
      activateOnGreaterThan: { key: THRESHOLD_KEY, field: 'ActivateAboveThreshold' },
    },
  },
};

// The echo field for a given own-Key field, or null when there is nothing to
// mirror.
export function redundantEchoField(
  prefabId: string,
  key: string,
  field: string
): { key: string; field: string } | null {
  return REDUNDANT_ECHOES[prefabId]?.[key]?.[field] ?? null;
}

// Every Key that exists only to echo `key` on this prefab — i.e. every Key that
// must be dropped alongside it, since clearing the canonical Key while leaving
// an echo behind keeps the value pinned through the echo. Empty for a Key with
// no echoes, including `IThresholdSwitch` on a real threshold sensor, where it
// is the canonical Key rather than a copy of one.
//
// A mirror target is only droppable when it is *nothing but* mirrors, so the
// answer is not "every Key named in the table" — it is every Key whose whole
// catalogued field set is accounted for there. Reading "receives a mirrored
// field" as "is a pure copy" is the same over-inference the panel used to make
// from `!= IThresholdSwitch`: the first partial mirror (one field echoed into a
// Key that also carries its own) would take the Key's independent fields down
// with it on Clear. Deriving the check from SETTINGS_CATALOG rather than
// asserting it in a comment means a partial mirror simply isn't returned, and
// an uncatalogued target — whose field set we cannot see, so cannot vouch for —
// is likewise left alone.
export function redundantEchoKeysFor(prefabId: string, key: string): string[] {
  const fields = REDUNDANT_ECHOES[prefabId]?.[key];
  if (fields == null) return [];

  const mirrored = new Map<string, Set<string>>();
  for (const echo of Object.values(fields)) {
    let seen = mirrored.get(echo.key);
    if (seen == null) mirrored.set(echo.key, (seen = new Set<string>()));
    seen.add(echo.field);
  }

  return [...mirrored]
    .filter(([echoKey, echoedFields]) => {
      const descriptors = SETTINGS_CATALOG[echoKey];
      if (descriptors == null || descriptors.length == 0) return false;
      return descriptors.every(descriptor => echoedFields.has(descriptor.field));
    })
    .map(([echoKey]) => echoKey);
}
