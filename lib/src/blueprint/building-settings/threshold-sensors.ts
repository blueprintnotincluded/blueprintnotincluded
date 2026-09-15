// Per-prefab meaning of the `IThresholdSwitch` buildingData key.
//
// The BlueprintsV2 handler registry is keyed by *component* name, not by
// prefab (ModAPI/API_Methods.cs RegisterVanillaBuildings), so every threshold
// sensor in the game writes the same two fields:
//
//   { "Key": "IThresholdSwitch", "Value": { "Threshold": 0.5, "ActivateAboveThreshold": true } }
//
// but `Threshold` is the raw sim value of whatever that *building* measures —
// kilograms, kelvin, lux, germs, rads or a critter count. It is never what the
// game's own side screen showed the player. Two of them need converting or the
// editor shows a number a thousand times off (gas pressure) or in the wrong
// scale entirely (temperature).
//
// Conversion is affine in both directions:
//   display = stored * displayScale + displayOffset
//   stored  = (display - displayOffset) / displayScale
//
// Ranges come from IThresholdSwitch.RangeMin/RangeMax, which are serialized
// per-prefab fields. The game clamps them in its slider UI but the *setter*
// does not validate, so treat them as SOFT bounds: clamp what the user types,
// never reject or rewrite a stored value that falls outside them.

export interface ThresholdSensorSpec {
  // Label for the Threshold row. Replaces the catalogue's generic
  // 'Threshold' with what the building actually measures.
  label: string;
  // Rendered after the input. Empty for a bare count.
  unitSuffix: string;
  // stored -> display multiplier.
  displayScale: number;
  // Added after scaling. Only temperature uses it (-273.15, K -> °C).
  displayOffset: number;
  // Soft bounds, in STORED units.
  storedMin: number;
  storedMax: number;
  // Input step and rounding, in DISPLAY units.
  step: number;
  decimals: number;
  // Used only when creating the key from scratch on a building that has none.
  // These are OUR editor's neutral starting points, not Klei's own defaults —
  // the user is clicking the button precisely to set the number, and both
  // fields are always written, so there is no partial-Value hazard here.
  defaultThreshold: number;
  defaultActivateAbove: boolean;
}

const KELVIN_OFFSET = -273.15;

function pressureGas(defaultThreshold: number): ThresholdSensorSpec {
  // Stored in kg, displayed in grams.
  return {
    label: 'Pressure',
    unitSuffix: 'g',
    displayScale: 1000,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 20,
    step: 1,
    decimals: 0,
    defaultThreshold,
    defaultActivateAbove: true,
  };
}

function pressureLiquid(defaultThreshold: number): ThresholdSensorSpec {
  return {
    label: 'Pressure',
    unitSuffix: 'kg',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 2000,
    step: 1,
    decimals: 1,
    defaultThreshold,
    defaultActivateAbove: true,
  };
}

function temperature(): ThresholdSensorSpec {
  // Stored in Kelvin regardless of the authoring player's °C/°F preference,
  // so a blueprint shared between two players carries the same number and
  // needs no migration. The site is Celsius throughout (BlueprintItem
  // .temperatureCelcius, the temperature picker), so display °C.
  return {
    label: 'Temperature',
    unitSuffix: '°C',
    displayScale: 1,
    displayOffset: KELVIN_OFFSET,
    storedMin: 0,
    storedMax: 9999,
    step: 1,
    decimals: 2,
    defaultThreshold: 293.15,
    defaultActivateAbove: true,
  };
}

function germs(): ThresholdSensorSpec {
  return {
    label: 'Germs',
    unitSuffix: 'germs',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 100000,
    step: 1,
    decimals: 0,
    defaultThreshold: 0,
    defaultActivateAbove: true,
  };
}

// Keyed by the building's prefab id (BlueprintItem.id / OniItem.id).
//
// The base sensors' units and ranges are the ones confirmed against the game
// assembly; the pipe/rail sensors measure the same quantity as their
// room-sensor twin and inherit its unit.
//
// LogicWattageSensor and LogicHEPSensor sat under "deliberately absent" on the
// claim that neither was a confirmed carrier. Both are: the decompiled game
// declares `class LogicWattageSensor : Switch, ISaveLoadable, IThresholdSwitch`
// and the same for LogicHEPSensor, each backing `Threshold` with a real
// serialized field (thresholdWattage / thresholdPayload) rather than aliasing
// another key the way the critter sensor does. The radbolt half of that claim
// confused the Radbolt *Sensor* with the Radbolt Generator and Battery —
// HighEnergyParticleSpawner.particleThreshold and HEPBattery.particleThreshold
// are genuinely different keys on genuinely different buildings, and remain
// unhandled.
//
// Deliberately absent:
//
//  - PressureSwitchGas, PressureSwitchLiquid, TemperatureControlledSwitch
//    ("Atmo/Hydro/Thermo Switch"). Confirmed deprecated in the game, so no
//    blueprint built from a real colony can contain one. All three Configs set
//
//        buildingDef.Deprecated = true;
//
//    and BuildingDef gates menu visibility on exactly that:
//
//        return !this.Deprecated && (!this.DebugOnly || Game.Instance.DebugOnlyBuildingsAllowed);
//
//    Note the asymmetry, because an earlier version of this note asked for the
//    wrong test: it suggested confirming in a debug/sandbox build menu "which
//    shows disabled content". That would never have worked. Debug mode reveals
//    DebugOnly buildings; Deprecated ones are excluded unconditionally, in
//    every mode. The wiki gap and the missing menu entry were correct evidence
//    after all -- they are pre-Automation-Update simple threshold switches,
//    superseded by Sensor + Logic Gate.
//
//    They do still carry a real IThresholdSwitch: `PressureSwitch :
//    CircuitSwitch, ISaveLoadable, IThresholdSwitch` with [Serialize] float
//    threshold, and the same for TemperatureControlledSwitch with
//    thresholdTemperature. So if they are ever restored to this table the units
//    are known -- kg stored / g shown for gas (rangeMax 2), kg for liquid
//    (rangeMax 2000), Kelvin stored / Celsius shown (maxTemp 573.15) -- but
//    they should not be, while the buildings are unreachable in game.
//
//    Separately: this site's build menu *does* offer all three, because
//    buildMenuItems carries an Electrical entry for each and the 2024 export
//    emits no deprecated flag for the converter to filter on. The same is true
//    of LogicMemory, RoleStation and SteamTurbine (the pre-SteamTurbine2 one).
//    That is an import-pipeline gap, not a settings one.
//  - Element sensors (LogicElementSensorGas and the conduit element sensors)
//    have no threshold at all: their setting is a Filterable/SelectedTag
//    element name.
//  - LogicCritterCountSensor. It *is* an IThresholdSwitch carrier, but this
//    table is for prefabs whose bare `Threshold` float needs a unit and a
//    conversion — and the critter sensor's threshold is a plain count with no
//    conversion at all. It is still handled *like* a threshold sensor
//    (settings-catalog.ts: CRITTER_COUNT_SENSOR_ID): its own Key is the single
//    canonical settings key primarySettingsKey() reports, and both the
//    stowaway `Switch` and the redundant `IThresholdSwitch` echo — in the game
//    source LogicCritterCountSensor.Threshold is literally `get =>
//    countThreshold` — are suppressed by resolveSettingDescriptors rather than
//    rewritten. An edit to the own Key is mirrored onto an existing echo
//    (redundantEchoField) so the mod's key-apply pass can't clobber it, and
//    Clear drops both keys.
export const THRESHOLD_SENSORS: Record<string, ThresholdSensorSpec> = {
  // Atmo Sensor — 1000 g is the game's own starting point.
  LogicPressureSensorGas: pressureGas(1),

  // Hydro Sensor.
  LogicPressureSensorLiquid: pressureLiquid(100),

  // Thermo Sensor and the three pipe/rail thermo sensors.
  LogicTemperatureSensor: temperature(),
  GasConduitTemperatureSensor: temperature(),
  LiquidConduitTemperatureSensor: temperature(),
  SolidConduitTemperatureSensor: temperature(),

  LogicLightSensor: {
    label: 'Light',
    unitSuffix: 'lux',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 15000,
    step: 1,
    decimals: 0,
    defaultThreshold: 280,
    defaultActivateAbove: true,
  },

  // Germ Sensor and the three pipe/rail germ sensors.
  LogicDiseaseSensor: germs(),
  GasConduitDiseaseSensor: germs(),
  LiquidConduitDiseaseSensor: germs(),
  SolidConduitDiseaseSensor: germs(),

  LogicRadiationSensor: {
    label: 'Radiation',
    unitSuffix: 'rads',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 4727,
    step: 1,
    decimals: 0,
    defaultThreshold: 280,
    defaultActivateAbove: false,
  },

  // Wattage Sensor. Watts 1:1 — Sim200ms compares thresholdWattage straight
  // against circuitManager.GetWattsUsedByCircuit(), so the stored number is
  // already what the side screen reads. RangeMax is
  // 1.5f * Wire.GetMaxWattageAsFloat(Max50000) = 1.5x a heavi-watt wire.
  LogicWattageSensor: {
    label: 'Wattage',
    unitSuffix: 'W',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 75000,
    step: 1,
    decimals: 0,
    defaultThreshold: 1000,
    defaultActivateAbove: true,
  },

  // Radbolt Sensor (Spaced Out). A plain count; RangeMax is the flat
  // maxPayload = 500f.
  LogicHEPSensor: {
    label: 'Radbolt',
    unitSuffix: 'radbolts',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 500,
    step: 1,
    decimals: 0,
    defaultThreshold: 10,
    defaultActivateAbove: true,
  },
};

export function thresholdSensorSpec(prefabId: string): ThresholdSensorSpec | undefined {
  return Object.prototype.hasOwnProperty.call(THRESHOLD_SENSORS, prefabId)
    ? THRESHOLD_SENSORS[prefabId]
    : undefined;
}
