import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import {
  Blueprint,
  BlueprintHelpers,
  BniBuildingData,
  creatableSettingsKeysFor,
  formatBuildingDataEntry,
  isKnownSettingsKey,
  OniItem,
  resolveSettingDescriptors,
  SETTINGS_CATALOG,
  THRESHOLD_SENSORS,
  thresholdSensorSpec,
  toDisplayValue,
  toStoredValue,
} from '../../lib/index';
import { loadGameDatabase } from '../helpers/roomFixtures';

// Catalogue + formatter unit coverage (spec/building-settings-plan.md phase 2).
// Pure, no game database needed.
describe('building-settings catalogue', function () {
  it('recognizes every key from the plan\'s automation table', () => {
    const expectedKeys = [
      'Switch',
      'LogicTimerSensor',
      'LogicTimeOfDaySensor',
      'LogicCounter',
      'LogicGateBuffer',
      'LogicGateFilter',
      'LogicRibbonReader',
      'LogicRibbonWriter',
      'LogicCritterCountSensor',
      'LogicAlarm',
      'IThresholdSwitch',
      'IActivationRangeTarget',
      'BuildingEnabledButton',
      'Automatable',
    ];
    for (const key of expectedKeys) expect(isKnownSettingsKey(key)).to.equal(true);
  });

  it('does not know keys outside the curated set', () => {
    for (const key of ['Door', 'Valve', 'PixelPack', 'AccessControl', 'Filterable'])
      expect(isKnownSettingsKey(key)).to.equal(false);
  });

  it('marks LogicTimerSensor.timeElapsedInCurrentState hidden', () => {
    const descriptor = SETTINGS_CATALOG.LogicTimerSensor.find(
      d => d.field == 'timeElapsedInCurrentState'
    )!;
    expect(descriptor.hidden).to.equal(true);
  });
});

describe('formatBuildingDataEntry', function () {
  it('returns null for a Key outside the curated catalogue', () => {
    const entry: BniBuildingData = { Key: 'Door', Value: { requestedState: 1 } };
    expect(formatBuildingDataEntry(entry)).to.equal(null);
  });

  it('formats a Switch entry', () => {
    const rows = formatBuildingDataEntry({ Key: 'Switch', Value: { switchedOn: true } });
    expect(rows).to.deep.equal([{ field: 'switchedOn', label: 'On', text: 'On' }]);
  });

  it('omits the hidden runtime field and formats the rest of LogicTimerSensor', () => {
    const rows = formatBuildingDataEntry({
      Key: 'LogicTimerSensor',
      Value: {
        onDuration: 5.0,
        offDuration: 5.0,
        timeElapsedInCurrentState: 3.099925,
        displayCyclesMode: false,
      },
    })!;
    expect(rows.map(r => r.field)).to.deep.equal(['onDuration', 'offDuration', 'displayCyclesMode']);
    expect(rows.find(r => r.field == 'onDuration')!.text).to.equal('5 s');
    expect(rows.find(r => r.field == 'displayCyclesMode')!.text).to.equal('Off');
  });

  it('appends a cycle count once a duration crosses 600s', () => {
    const rows = formatBuildingDataEntry({
      Key: 'LogicTimerSensor',
      Value: {
        onDuration: 6.0,
        offDuration: 6000.0,
        timeElapsedInCurrentState: 0.78333354,
        displayCyclesMode: true,
      },
    })!;
    // Below the threshold, but displayCyclesMode still forces the cycle suffix.
    expect(rows.find(r => r.field == 'onDuration')!.text).to.equal('6 s (~0.01 cycles)');
    expect(rows.find(r => r.field == 'offDuration')!.text).to.equal('6000 s (~10 cycles)');
  });

  it('renders LogicTimeOfDaySensor fractions as a percentage of the cycle', () => {
    const rows = formatBuildingDataEntry({
      Key: 'LogicTimeOfDaySensor',
      Value: { startTime: 0.249224767, duration: 0.000996187 },
    })!;
    expect(rows.find(r => r.field == 'startTime')!.text).to.equal('24.92% of cycle');
    expect(rows.find(r => r.field == 'duration')!.text).to.equal('0.1% of cycle');
  });

  it('renders selectedBit with the bit unit', () => {
    const rows = formatBuildingDataEntry({
      Key: 'LogicRibbonReader',
      Value: { selectedBit: 2 },
    })!;
    expect(rows).to.deep.equal([{ field: 'selectedBit', label: 'Bit', text: 'Bit 2' }]);
  });

  it('renders an empty string field as an em dash', () => {
    const rows = formatBuildingDataEntry({
      Key: 'LogicAlarm',
      Value: {
        notificationName: '',
        notificationTooltip: 'Something happened',
        notificationType: 0,
        pauseOnNotify: false,
        zoomOnNotify: true,
        cooldown: 12.5,
      },
    })!;
    expect(rows.find(r => r.field == 'notificationName')!.text).to.equal('—');
    expect(rows.find(r => r.field == 'notificationTooltip')!.text).to.equal('Something happened');
    expect(rows.find(r => r.field == 'cooldown')!.text).to.equal('12.5 s');
  });

  it('skips fields the stored Value is missing rather than failing the whole entry', () => {
    // An older/partial file might not carry every field the catalogue knows
    // about — the formatter must be forgiving on the read-only display path.
    const rows = formatBuildingDataEntry({
      Key: 'LogicCounter',
      Value: { maxCount: 3 },
    })!;
    expect(rows).to.deep.equal([{ field: 'maxCount', label: 'Target count', text: '3' }]);
  });

  it('does not eat a real trailing zero on a whole-number int field (CodeRabbit #212)', () => {
    // formatNumber(10, 0) previously stripped the trailing zero as if it were
    // decimal-formatting noise, displaying "1" for a target count of 10.
    const rows = formatBuildingDataEntry({
      Key: 'LogicCounter',
      Value: { maxCount: 10 },
    })!;
    expect(rows).to.deep.equal([{ field: 'maxCount', label: 'Target count', text: '10' }]);
  });

  it('does not eat trailing zeroes on other whole-number int fields (100, 20)', () => {
    const rows100 = formatBuildingDataEntry({
      Key: 'LogicCritterCountSensor',
      Value: {
        countThreshold: 100,
        activateOnGreaterThan: true,
        countCritters: true,
        countEggs: false,
      },
    })!;
    expect(rows100.find(r => r.field == 'countThreshold')!.text).to.equal('100');

    const rows20 = formatBuildingDataEntry({
      Key: 'LogicCritterCountSensor',
      Value: {
        countThreshold: 20,
        activateOnGreaterThan: true,
        countCritters: true,
        countEggs: false,
      },
    })!;
    expect(rows20.find(r => r.field == 'countThreshold')!.text).to.equal('20');
  });
});

// Write path (spec/building-settings-plan.md phase 3 step 1). Needs the real
// game database so BlueprintHelpers.createInstance can build real items.
describe('BlueprintItem.setBuildingSetting / addBuildingSetting', function () {
  before(function () {
    loadGameDatabase();
  });

  it('replaces one field on an already-present Key, keeping every other field verbatim', () => {
    const item = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    item.buildingData = [
      { Key: 'Switch', Value: { switchedOn: true } },
      {
        Key: 'LogicTimerSensor',
        Value: {
          onDuration: 5.0,
          offDuration: 5.0,
          timeElapsedInCurrentState: 3.099925,
          displayCyclesMode: false,
        },
      },
    ];

    item.setBuildingSetting('LogicTimerSensor', 'onDuration', 42);

    const entry = item.buildingData.find(e => e.Key == 'LogicTimerSensor')!;
    expect(entry.Value).to.deep.equal({
      onDuration: 42,
      offDuration: 5.0,
      timeElapsedInCurrentState: 3.099925,
      displayCyclesMode: false,
    });
    // Untouched sibling Key survives.
    expect(item.buildingData.find(e => e.Key == 'Switch')!.Value).to.deep.equal({
      switchedOn: true,
    });
  });

  it('creates a complete Value object from catalogue defaults when the Key is absent', () => {
    const item = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    expect(item.buildingData).to.equal(undefined);

    item.setBuildingSetting('LogicTimerSensor', 'onDuration', 42);

    expect(item.buildingData).to.have.length(1);
    expect(item.buildingData![0]).to.deep.equal({
      Key: 'LogicTimerSensor',
      Value: {
        onDuration: 42,
        offDuration: 10,
        timeElapsedInCurrentState: 0,
        displayCyclesMode: false,
      },
    });
  });

  it('addBuildingSetting creates every default field without an explicit edit', () => {
    const item = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    const created = item.addBuildingSetting('LogicTimerSensor');

    expect(created).to.equal(true);
    expect(item.buildingData![0].Value).to.deep.equal({
      onDuration: 10,
      offDuration: 10,
      timeElapsedInCurrentState: 0,
      displayCyclesMode: false,
    });
  });

  it('addBuildingSetting is a no-op (still true) when the Key is already present', () => {
    const item = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    item.buildingData = [{ Key: 'LogicTimerSensor', Value: { onDuration: 99 } }];

    expect(item.addBuildingSetting('LogicTimerSensor')).to.equal(true);
    // Existing entry is untouched, not replaced with defaults.
    expect(item.buildingData).to.have.length(1);
    expect(item.buildingData[0].Value).to.deep.equal({ onDuration: 99 });
  });

  it('rejects creating a Key with no verified defaults on this building', () => {
    // LogicCounter's resetCountAtMax/advancedMode defaults are not verified
    // (settings-catalog.ts), so it must not be creatable from scratch.
    const item = BlueprintHelpers.createInstance('LogicCounter')!;
    expect(item.addBuildingSetting('LogicCounter')).to.equal(false);
    expect(() => item.setBuildingSetting('LogicCounter', 'maxCount', 5)).to.throw(
      /is not present.*no creatable defaults/
    );
  });

  it('rejects creating a Key on a building where it is not the hand-checked creatable one', () => {
    // LogicTimerSensor's own Key is creatable on that building, but a Key
    // that has no defaults entry at all for this prefab must still reject.
    const item = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    expect(() => item.setBuildingSetting('LogicCounter', 'maxCount', 5)).to.throw();
  });

  it('repairs a null/malformed Value on an already-present Key instead of crashing (CodeRabbit #212)', () => {
    const item = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    item.buildingData = [{ Key: 'Switch', Value: null as any }];

    expect(() => item.setBuildingSetting('Switch', 'switchedOn', true)).to.not.throw();
    expect(item.buildingData[0].Value).to.deep.equal({ switchedOn: true });
  });

  it('does not share the created Value object with the catalogue defaults or another item', () => {
    const itemA = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    const itemB = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    itemA.addBuildingSetting('LogicTimerSensor');
    itemB.addBuildingSetting('LogicTimerSensor');

    itemA.setBuildingSetting('LogicTimerSensor', 'onDuration', 1);
    itemB.setBuildingSetting('LogicTimerSensor', 'onDuration', 2);

    expect(itemA.buildingData![0].Value.onDuration).to.equal(1);
    expect(itemB.buildingData![0].Value.onDuration).to.equal(2);

    // A third creation still gets the pristine default, proving the module
    // constant itself was never mutated by the two edits above.
    const itemC = BlueprintHelpers.createInstance('LogicTimerSensor')!;
    itemC.addBuildingSetting('LogicTimerSensor');
    expect(itemC.buildingData![0].Value.onDuration).to.equal(10);
  });

  it('full loop: editing a duration reaches toBniBlueprint as a complete LogicTimerSensor object', () => {
    const blueprint = new Blueprint();
    blueprint.importFromBni({
      friendlyname: '',
      buildings: [
        {
          offset: { x: 1, y: 1 },
          buildingdef: 'LogicTimerSensor',
          selected_elements: [-1725038055],
          buildingData: [
            { Key: 'Switch', Value: { switchedOn: true } },
            {
              Key: 'LogicTimerSensor',
              Value: {
                onDuration: 5.0,
                offDuration: 5.0,
                timeElapsedInCurrentState: 3.099925,
                displayCyclesMode: false,
              },
            },
          ],
        },
      ],
      digcommands: [],
    } as any);

    blueprint.blueprintItems[0].setBuildingSetting('LogicTimerSensor', 'onDuration', 30);

    const bni = blueprint.toBniBlueprint('edited');
    const timerEntry = bni.buildings[0].buildingData!.find(e => e.Key == 'LogicTimerSensor')!;
    expect(timerEntry.Value).to.deep.equal({
      onDuration: 30,
      offDuration: 5.0,
      timeElapsedInCurrentState: 3.099925,
      displayCyclesMode: false,
    });
  });
});

// Per-building meaning of the IThresholdSwitch key. The handler is registered
// by component name, so every threshold sensor writes the same two fields but
// `Threshold` is the raw sim value of whatever that building measures.
describe('threshold sensors', function () {
  it('covers the confirmed IThresholdSwitch carriers and nothing unverified', () => {
    expect(Object.keys(THRESHOLD_SENSORS).sort()).to.deep.equal(
      [
        'GasConduitDiseaseSensor',
        'GasConduitTemperatureSensor',
        'LiquidConduitDiseaseSensor',
        'LiquidConduitTemperatureSensor',
        'LogicDiseaseSensor',
        'LogicLightSensor',
        'LogicPressureSensorGas',
        'LogicPressureSensorLiquid',
        'LogicRadiationSensor',
        'LogicTemperatureSensor',
        'SolidConduitDiseaseSensor',
        'SolidConduitTemperatureSensor',
      ].sort()
    );
  });

  it('converts gas pressure between stored kg and displayed grams', () => {
    const descriptor = resolveSettingDescriptors('LogicPressureSensorGas', 'IThresholdSwitch').find(
      d => d.field == 'Threshold'
    )!;
    expect(descriptor.unitSuffix).to.equal('g');
    expect(toDisplayValue(descriptor, 1.5)).to.equal(1500);
    expect(toStoredValue(descriptor, 1500)).to.equal(1.5);
    // The catalogue bound is stored-unit; 20 kg is the 20000 g the UI shows.
    expect(toDisplayValue(descriptor, descriptor.max!)).to.equal(20000);
  });

  it('converts temperature between stored Kelvin and displayed Celsius', () => {
    const descriptor = resolveSettingDescriptors('LogicTemperatureSensor', 'IThresholdSwitch').find(
      d => d.field == 'Threshold'
    )!;
    expect(descriptor.unitSuffix).to.equal('°C');
    expect(toDisplayValue(descriptor, 293.15)).to.be.closeTo(20, 1e-9);
    expect(toStoredValue(descriptor, -10)).to.be.closeTo(263.15, 1e-9);
  });

  it('round-trips every spec through display and back', () => {
    for (const [prefabId, spec] of Object.entries(THRESHOLD_SENSORS)) {
      const descriptor = resolveSettingDescriptors(prefabId, 'IThresholdSwitch').find(
        d => d.field == 'Threshold'
      )!;
      for (const stored of [spec.storedMin, spec.defaultThreshold, spec.storedMax]) {
        expect(toStoredValue(descriptor, toDisplayValue(descriptor, stored))).to.be.closeTo(
          stored,
          1e-6,
          `${prefabId} @ ${stored}`
        );
      }
    }
  });

  it('leaves the ActivateAboveThreshold toggle alone', () => {
    const descriptor = resolveSettingDescriptors('LogicLightSensor', 'IThresholdSwitch').find(
      d => d.field == 'ActivateAboveThreshold'
    )!;
    expect(descriptor.type).to.equal('bool');
    expect(descriptor.unitSuffix).to.equal(undefined);
  });

  it('falls back to the bare catalogue entry on a building with no spec', () => {
    expect(resolveSettingDescriptors('LogicCounter', 'IThresholdSwitch')).to.deep.equal(
      SETTINGS_CATALOG.IThresholdSwitch
    );
    expect(thresholdSensorSpec('LogicCounter')).to.equal(undefined);
  });

  // Sensors extend Switch, so the mod's Switch handler matches them and a
  // copied sensor carries a stowaway switchedOn holding its sampled output.
  it('suppresses the stowaway Switch key on a sensor but not on a real switch', () => {
    expect(resolveSettingDescriptors('LogicPressureSensorGas', 'Switch')).to.deep.equal([]);
    expect(resolveSettingDescriptors('LogicSwitch', 'Switch')).to.deep.equal(
      SETTINGS_CATALOG.Switch
    );
  });

  it('still counts a suppressed Switch as known, not as an unknown stored setting', () => {
    const entry: BniBuildingData = { Key: 'Switch', Value: { switchedOn: true } };
    expect(formatBuildingDataEntry(entry, 'LogicPressureSensorGas')).to.deep.equal([]);
    expect(formatBuildingDataEntry({ Key: 'Door', Value: {} }, 'LogicPressureSensorGas')).to.equal(
      null
    );
  });

  it('formats a threshold in the unit of the building that carries it', () => {
    const entry: BniBuildingData = {
      Key: 'IThresholdSwitch',
      Value: { Threshold: 0.5, ActivateAboveThreshold: true },
    };
    const rows = formatBuildingDataEntry(entry, 'LogicPressureSensorGas')!;
    expect(rows.find(r => r.field == 'Threshold')!.text).to.equal('500 g');
    // Unqualified, it is still the bare catalogue number it always was.
    expect(formatBuildingDataEntry(entry)!.find(r => r.field == 'Threshold')!.text).to.equal('0.5');
  });
});

describe('threshold sensors against the game database', function () {
  before(function () {
    loadGameDatabase();
  });

  it('names only prefabs that exist in database-2024.json', () => {
    for (const prefabId of Object.keys(THRESHOLD_SENSORS))
      expect(() => OniItem.getOniItem(prefabId), prefabId).to.not.throw();
  });

  it('offers IThresholdSwitch as creatable on every sensor', () => {
    for (const prefabId of Object.keys(THRESHOLD_SENSORS))
      expect(creatableSettingsKeysFor(prefabId), prefabId).to.include('IThresholdSwitch');
    // ...and on nothing else. LogicTimerSensor keeps its own creatable key.
    expect(creatableSettingsKeysFor('LogicTimerSensor')).to.deep.equal(['LogicTimerSensor']);
    expect(creatableSettingsKeysFor('LogicCounter')).to.deep.equal([]);
  });

  it('creates a complete Value that survives a blueprint round-trip', () => {
    const item = BlueprintHelpers.createInstance('LogicPressureSensorGas')!;
    expect(item.addBuildingSetting('IThresholdSwitch')).to.equal(true);
    item.setBuildingSetting('IThresholdSwitch', 'Threshold', 1.5);

    const blueprint = new Blueprint();
    blueprint.blueprintItems = [item];
    const exported = blueprint.toBniBlueprint('threshold');
    expect(exported.buildings![0].buildingData).to.deep.equal([
      { Key: 'IThresholdSwitch', Value: { Threshold: 1.5, ActivateAboveThreshold: true } },
    ]);
  });

});

// "Not set" is a real state, distinct from any stored value: the mod only
// applies keys the file actually carries, so an absent IThresholdSwitch leaves
// the built sensor on the game's own default.
describe('BlueprintItem.removeBuildingSetting', function () {
  before(function () {
    loadGameDatabase();
  });

  it('is the inverse of addBuildingSetting', () => {
    const item = BlueprintHelpers.createInstance('LogicPressureSensorGas')!;
    expect(item.addBuildingSetting('IThresholdSwitch')).to.equal(true);
    expect(item.buildingData!.map(e => e.Key)).to.deep.equal(['IThresholdSwitch']);

    expect(item.removeBuildingSetting('IThresholdSwitch')).to.equal(true);
    expect(item.buildingData!.map(e => e.Key)).to.deep.equal([]);
  });

  it('leaves every other Key verbatim', () => {
    const item = BlueprintHelpers.createInstance('LogicPressureSensorGas')!;
    item.buildingData = [
      { Key: 'Switch', Value: { switchedOn: true } },
      { Key: 'IThresholdSwitch', Value: { Threshold: 1.5, ActivateAboveThreshold: true } },
      { Key: 'Prioritizable', Value: { masterPrioritySetting: '{}' } },
    ];

    expect(item.removeBuildingSetting('IThresholdSwitch')).to.equal(true);

    expect(item.buildingData).to.deep.equal([
      { Key: 'Switch', Value: { switchedOn: true } },
      { Key: 'Prioritizable', Value: { masterPrioritySetting: '{}' } },
    ]);
  });

  it('reports false when there was nothing to remove', () => {
    const item = BlueprintHelpers.createInstance('LogicPressureSensorGas')!;
    expect(item.removeBuildingSetting('IThresholdSwitch')).to.equal(false);
    item.buildingData = [{ Key: 'Switch', Value: { switchedOn: true } }];
    expect(item.removeBuildingSetting('IThresholdSwitch')).to.equal(false);
  });

  it('exports a document identical to one that never had the key', () => {
    const pristine = BlueprintHelpers.createInstance('LogicPressureSensorGas')!;
    const edited = BlueprintHelpers.createInstance('LogicPressureSensorGas')!;
    edited.addBuildingSetting('IThresholdSwitch');
    edited.setBuildingSetting('IThresholdSwitch', 'Threshold', 1.5);
    edited.removeBuildingSetting('IThresholdSwitch');

    const exportOf = (item: typeof pristine) => {
      const blueprint = new Blueprint();
      blueprint.blueprintItems = [item];
      return blueprint.toBniBlueprint('x').buildings![0];
    };

    // buildingData is omitted when empty, so a cleared sensor is byte-identical
    // to one that was never touched — which is what makes clearing a faithful
    // return to "this blueprint says nothing about the threshold".
    expect(exportOf(edited)).to.deep.equal(exportOf(pristine));
    expect(exportOf(edited).buildingData).to.equal(undefined);
  });

  it('leaves the critter sensor out of the threshold table entirely', () => {
    // It carries the same two values under two Keys, and its own Key also
    // holds countCritters/countEggs, which cannot be separated from them —
    // so clearing its threshold would discard what it counts. Deferred.
    expect(thresholdSensorSpec('LogicCritterCountSensor')).to.equal(undefined);
    expect(creatableSettingsKeysFor('LogicCritterCountSensor')).to.deep.equal([]);
    // Its rows still render through the plain catalogue, unchanged.
    expect(resolveSettingDescriptors('LogicCritterCountSensor', 'LogicCritterCountSensor')).to.equal(
      SETTINGS_CATALOG.LogicCritterCountSensor
    );
  });
});
