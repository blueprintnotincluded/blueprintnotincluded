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
// The seven base sensors' units and ranges are the ones confirmed against the
// game assembly; the pipe/rail sensors measure the same quantity as their
// room-sensor twin and inherit its unit.
//
// Deliberately absent:
//
//  - PressureSwitchGas, PressureSwitchLiquid, TemperatureControlledSwitch
//    ("Atmo/Hydro/Thermo Switch"). The 2024 export carries full names,
//    descriptions and a buildMenuItems entry for all three (filed under
//    Power/Electrical, not Automation), which is what led an earlier version
//    of this table to include them. But neither wiki (wiki.gg or Fandom) has
//    a page for any of them, web search for "Thermo Switch" returns Thermo
//    *Sensor* results instead, and a live playthrough did not find them in
//    the Electrical build menu. That combination looks like pre-Automation-
//    Update legacy data (simple threshold switches, superseded by Sensor +
//    Logic Gate) that the export tool still dumps because it reads prefab
//    definitions rather than actual build-menu reachability. Pulled until
//    someone confirms in a debug/sandbox build menu (which shows disabled
//    content) whether they're placeable at all.
//  - LogicWattageSensor and LogicHEPSensor. Neither is a confirmed
//    IThresholdSwitch carrier, and radbolt thresholds demonstrably live on
//    HighEnergyParticleSpawner.particleThreshold /
//    HEPBattery.particleThreshold — different keys entirely.
//  - Element sensors (LogicElementSensorGas and the conduit element sensors)
//    have no threshold at all: their setting is a Filterable/SelectedTag
//    element name.
//  - LogicCritterCountSensor. It *is* a carrier, but it writes the same two
//    values twice — under its own key as countThreshold/activateOnGreaterThan
//    and again under IThresholdSwitch — and its own key also carries
//    countCritters/countEggs, which are not threshold settings and cannot be
//    separated (the mod's handler bails on the whole Value object if any
//    field is missing). So clearing a critter sensor's threshold cannot avoid
//    also discarding what it counts. Deferred to its own change rather than
//    solved badly here.
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
};

export function thresholdSensorSpec(prefabId: string): ThresholdSensorSpec | undefined {
  return Object.prototype.hasOwnProperty.call(THRESHOLD_SENSORS, prefabId)
    ? THRESHOLD_SENSORS[prefabId]
    : undefined;
}
