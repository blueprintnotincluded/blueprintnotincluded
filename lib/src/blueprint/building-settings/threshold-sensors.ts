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
// game assembly; the pipe/rail sensors and the three Switch buildings measure
// the same quantity as their room-sensor twin and inherit its unit.
//
// Deliberately absent: LogicWattageSensor and LogicHEPSensor. Neither is a
// confirmed IThresholdSwitch carrier, and radbolt thresholds demonstrably live
// on HighEnergyParticleSpawner.particleThreshold / HEPBattery.particleThreshold
// — different keys entirely. Element sensors (LogicElementSensorGas and the
// conduit element sensors) have no threshold at all: their setting is a
// Filterable/SelectedTag element name, handled separately.
export const THRESHOLD_SENSORS: Record<string, ThresholdSensorSpec> = {
  // Atmo Sensor / Atmo Switch — 1000 g is the game's own starting point.
  LogicPressureSensorGas: pressureGas(1),
  PressureSwitchGas: pressureGas(1),

  // Hydro Sensor / Hydro Switch.
  LogicPressureSensorLiquid: pressureLiquid(100),
  PressureSwitchLiquid: pressureLiquid(100),

  // Thermo Sensor / Thermo Switch and the three pipe/rail thermo sensors.
  LogicTemperatureSensor: temperature(),
  TemperatureControlledSwitch: temperature(),
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
    defaultThreshold: 0,
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
    storedMax: 5000,
    step: 1,
    decimals: 0,
    defaultThreshold: 0,
    defaultActivateAbove: true,
  },

  // Critter Sensor. LogicCritterCountSensor.Threshold is a float property
  // wrapping the countThreshold int, so IThresholdSwitch expresses the same
  // state — see SETTING_MIRRORS in settings-catalog.ts.
  LogicCritterCountSensor: {
    label: 'Critters',
    unitSuffix: '',
    displayScale: 1,
    displayOffset: 0,
    storedMin: 0,
    storedMax: 64,
    step: 1,
    decimals: 0,
    defaultThreshold: 3,
    defaultActivateAbove: true,
  },
};

export function thresholdSensorSpec(prefabId: string): ThresholdSensorSpec | undefined {
  return Object.prototype.hasOwnProperty.call(THRESHOLD_SENSORS, prefabId)
    ? THRESHOLD_SENSORS[prefabId]
    : undefined;
}

export function isThresholdSensor(prefabId: string): boolean {
  return thresholdSensorSpec(prefabId) != null;
}
