import { THRESHOLD_SENSORS, thresholdSensorSpec } from './threshold-sensors';

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

export type SettingFieldType = 'bool' | 'float' | 'int' | 'string' | 'enum';

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
}

// The above/below choice every threshold sensor carries. It is a direction,
// not an on/off state, so a checkbox labelled "Activate above threshold" makes
// the reader negate it in their head to understand "below"; the game's own
// side screen shows the two directions side by side.
const ABOVE_BELOW: Pick<SettingFieldDescriptor, 'labelKey' | 'type' | 'booleanLabels'> = {
  labelKey: 'Activate when',
  type: 'bool',
  booleanLabels: { whenTrue: 'Above', whenFalse: 'Below' },
};

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
    { field: 'countThreshold', labelKey: 'Threshold', type: 'int', min: 0 },
    { field: 'activateOnGreaterThan', ...ABOVE_BELOW },
    { field: 'countCritters', labelKey: 'Count critters', type: 'bool' },
    { field: 'countEggs', labelKey: 'Count eggs', type: 'bool' },
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

  IThresholdSwitch: [
    { field: 'Threshold', labelKey: 'Threshold', type: 'float' },
    { field: 'ActivateAboveThreshold', ...ABOVE_BELOW },
  ],

  IActivationRangeTarget: [
    { field: 'ActivateValue', labelKey: 'Activate value', type: 'float' },
    { field: 'DeactivateValue', labelKey: 'Deactivate value', type: 'float' },
  ],

  BuildingEnabledButton: [{ field: 'IsEnabled', labelKey: 'Enabled', type: 'bool' }],

  Automatable: [{ field: 'automationOnly', labelKey: 'Automation only', type: 'bool' }],
};

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

// Two Keys that describe one component state, so an edit to either must move
// both or the file contradicts itself. The mod applies handlers in registration
// order (ModAPI/API_Methods.cs), and IThresholdSwitch is registered *after*
// LogicCritterCountSensor, so on a disagreement IThresholdSwitch silently wins.
//
// `toInt` marks the direction that lands on an int field:
// LogicCritterCountSensor.Threshold is a float property wrapping the
// countThreshold int (`countThreshold = (int)value`).
export interface SettingMirror {
  key: string;
  field: string;
  toInt?: boolean;
  // True on the redundant half of the pair: when both Keys are present the UI
  // renders this field once, under the *other* Key. The generic
  // IThresholdSwitch is the half that yields, because the specific key carries
  // the rest of the building's settings (countCritters/countEggs) alongside.
  redundant?: boolean;
}

export const SETTING_MIRRORS: Record<string, Record<string, SettingMirror>> = {
  LogicCritterCountSensor: {
    countThreshold: { key: 'IThresholdSwitch', field: 'Threshold' },
    activateOnGreaterThan: { key: 'IThresholdSwitch', field: 'ActivateAboveThreshold' },
  },
  IThresholdSwitch: {
    Threshold: {
      key: 'LogicCritterCountSensor',
      field: 'countThreshold',
      toInt: true,
      redundant: true,
    },
    ActivateAboveThreshold: {
      key: 'LogicCritterCountSensor',
      field: 'activateOnGreaterThan',
      redundant: true,
    },
  },
};

export function settingMirrorFor(key: string, field: string): SettingMirror | undefined {
  return SETTING_MIRRORS[key]?.[field];
}

// The descriptors to render for one Key *on one building*. Identical to
// SETTINGS_CATALOG[key] except where the building changes what the Key means:
//
//  - `IThresholdSwitch` on a threshold sensor: the bare unitless `Threshold`
//    float becomes the quantity that building actually measures, with the
//    conversion and soft bounds from THRESHOLD_SENSORS.
//  - `Switch` on a threshold sensor: nothing. Sensors extend Switch, so the
//    mod's Switch handler matches them and a copied sensor carries a stowaway
//    `switchedOn` holding its sampled *output* at copy time, which the game
//    overwrites within ~1.8s. It round-trips, but it is not a setting and must
//    not be offered as one. The manual LogicSwitch is not a threshold sensor,
//    so it keeps its editable row.
export function resolveSettingDescriptors(
  prefabId: string,
  key: string
): SettingFieldDescriptor[] {
  const base = SETTINGS_CATALOG[key];
  if (base == null) return [];

  const spec = thresholdSensorSpec(prefabId);
  if (spec == null) return base;

  if (key == 'Switch') return [];
  if (key != 'IThresholdSwitch') return base;

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
};

for (const [prefabId, spec] of Object.entries(THRESHOLD_SENSORS)) {
  // Note the critter sensor gets IThresholdSwitch only, never its own
  // LogicCritterCountSensor key: LogicCritterCountSensor.Threshold is a float
  // property wrapping countThreshold, so applying IThresholdSwitch alone sets
  // the count correctly and leaves countCritters/countEggs at the game's own
  // defaults instead of guessing them.
  const forPrefab = (CREATABLE_SETTINGS[prefabId] ??= {});
  forPrefab['IThresholdSwitch'] = {
    Threshold: spec.defaultThreshold,
    ActivateAboveThreshold: spec.defaultActivateAbove,
  };
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
