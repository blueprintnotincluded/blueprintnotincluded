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
    { field: 'activateOnGreaterThan', labelKey: 'Activate above threshold', type: 'bool' },
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
    { field: 'ActivateAboveThreshold', labelKey: 'Activate above threshold', type: 'bool' },
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

// Editing an already-present Key is offered for every entry in
// SETTINGS_CATALOG above. *Creating* a Key from scratch (a building placed in
// the editor, or an uploaded file that omitted it because it was all-default)
// is a narrower, hand-checked set: TryApplyData bails on the whole Value
// object if any one field is missing, so a synthesized object must supply
// every field with the real in-game default or it silently does nothing —
// and worse, a wrong guess for a gameplay-affecting field changes the
// building's behaviour versus leaving it absent.
//
// v1 ships only LogicTimerSensor, whose four fields are all either given
// (onDuration/offDuration: spec/building-settings-plan.md phase 3 step 1) or
// definitionally safe (timeElapsedInCurrentState: 0 for a fresh component;
// displayCyclesMode: a display-only toggle with no simulation effect even if
// the guessed default is wrong). Every other automation key — including
// LogicCounter, whose resetCountAtMax/advancedMode defaults are not
// confirmed — stays edit-only-when-present until its real defaults are
// verified in-game. Extend CREATABLE_SETTINGS then, per building prefab id.
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
