import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  Blueprint,
  BlueprintHelpers,
  BniBuildingData,
  BuildableElement,
  creatableSettingsKeysFor,
  decodeTagSet,
  encodeTagSet,
  FILTERABLE_BUILDINGS,
  formatBuildingDataEntry,
  getCreatableSettingDefaults,
  isKnownSettingsKey,
  OniItem,
  primarySettingsKey,
  redundantEchoField,
  redundantEchoKeysFor,
  resolveSettingDescriptors,
  SETTINGS_CATALOG,
  THRESHOLD_SENSORS,
  thresholdSensorSpec,
  toDisplayValue,
  toStoredValue,
  readSettingField,
  writeSettingField,
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
      'Filterable',
      'TreeFilterable',
    ];
    for (const key of expectedKeys) expect(isKnownSettingsKey(key)).to.equal(true);
  });

  it('does not know keys outside the curated set', () => {
    // HighEnergyParticleRedirector is a real mod Key (the Radbolt Reflector's
    // direction) with no catalogue entry. ISingleSliderControl is the game-side
    // interface behind the radbolt sliders, which the mod never registers, so
    // it is not a Key at all.
    for (const key of [
      'PixelPack',
      'AccessControl',
      'FlatTagFilterable',
      'HighEnergyParticleRedirector',
      'ISingleSliderControl',
    ])
      expect(isKnownSettingsKey(key)).to.equal(false);
  });

  it('marks LogicTimerSensor.timeElapsedInCurrentState hidden', () => {
    const descriptor = SETTINGS_CATALOG.LogicTimerSensor.find(
      d => d.field == 'timeElapsedInCurrentState'
    )!;
    expect(descriptor.hidden).to.equal(true);
  });

  describe('critter sensor (LogicCritterCountSensor)', () => {
    it('suppresses the stowaway Switch and the redundant IThresholdSwitch echo', () => {
      expect(resolveSettingDescriptors('LogicCritterCountSensor', 'Switch')).to.deep.equal([]);
      expect(
        resolveSettingDescriptors('LogicCritterCountSensor', 'IThresholdSwitch')
      ).to.deep.equal([]);
    });

    it('renders its own Key through the plain catalogue, unchanged', () => {
      expect(
        resolveSettingDescriptors('LogicCritterCountSensor', 'LogicCritterCountSensor')
      ).to.equal(SETTINGS_CATALOG.LogicCritterCountSensor);
      const threshold = SETTINGS_CATALOG.LogicCritterCountSensor.find(
        d => d.field == 'countThreshold'
      )!;
      expect(threshold.min).to.equal(0);
      expect(threshold.max).to.equal(64);
    });

    it('is not in the threshold table but is creatable from scratch', () => {
      // Not a unit-converting threshold sensor...
      expect(thresholdSensorSpec('LogicCritterCountSensor')).to.equal(undefined);
      // ...but its own Key can be synthesized, with the real game defaults.
      expect(creatableSettingsKeysFor('LogicCritterCountSensor')).to.deep.equal([
        'LogicCritterCountSensor',
      ]);
      expect(
        getCreatableSettingDefaults('LogicCritterCountSensor', 'LogicCritterCountSensor')
      ).to.deep.equal({
        countThreshold: 0,
        activateOnGreaterThan: true,
        countCritters: true,
        countEggs: true,
      });
    });

    it('is the primary settings key for itself', () => {
      expect(primarySettingsKey('LogicCritterCountSensor')).to.deep.equal({
        key: 'LogicCritterCountSensor',
        label: 'Critter count',
      });
    });

    it('names IThresholdSwitch as a pure echo of its own Key', () => {
      expect(
        redundantEchoKeysFor('LogicCritterCountSensor', 'LogicCritterCountSensor')
      ).to.deep.equal(['IThresholdSwitch']);
    });
  });

  // The panel drops these alongside the canonical Key on Clear, so a Key that
  // is a building's real settings store must never appear here. Inferring the
  // list from "the primary Key is not IThresholdSwitch" got this right only
  // while the critter sensor was the single non-threshold carrier.
  it('reports no echoes for a Key that is a real settings store', () => {
    expect(redundantEchoKeysFor('LogicTemperatureSensor', 'IThresholdSwitch')).to.deep.equal(
      []
    );
    expect(redundantEchoKeysFor('LogicSwitch', 'Switch')).to.deep.equal([]);
    expect(
      redundantEchoKeysFor('LogicCritterCountSensor', 'IThresholdSwitch')
    ).to.deep.equal([]);
  });

  // The panel drops a named Key *whole*, so the promise is "this Key is nothing
  // but mirrors of the owning one" — not "this Key receives a mirror". Should a
  // future prefab echo one field into a Key that also carries its own, that Key
  // must fall out of the answer rather than take its independent fields down
  // with it on Clear. Checked over the real table so a partial mirror added
  // later fails here.
  it('only names an echo Key whose every catalogued field mirrors the owning Key', () => {
    for (const [prefabId, ownKey] of [
      ['LogicCritterCountSensor', 'LogicCritterCountSensor'],
    ] as const) {
      for (const echoKey of redundantEchoKeysFor(prefabId, ownKey)) {
        const mirrored = SETTINGS_CATALOG[ownKey]
          .map(descriptor => redundantEchoField(prefabId, ownKey, descriptor.field))
          .filter(echo => echo != null && echo.key == echoKey)
          .map(echo => echo!.field);
        expect(SETTINGS_CATALOG[echoKey].map(descriptor => descriptor.field)).to.have.members(
          mirrored
        );
      }
    }
  });

  it('reports the primary settings key per prefab', () => {
    expect(primarySettingsKey('LogicTemperatureSensor')).to.deep.equal({
      key: 'IThresholdSwitch',
      label: 'Temperature',
    });
    expect(primarySettingsKey('LogicSwitch')).to.equal(null);
  });

  describe('element sensors and filters (Filterable)', () => {
    it('suppresses the stowaway Switch and fills the picker phase per prefab', () => {
      expect(resolveSettingDescriptors('LogicElementSensorGas', 'Switch')).to.deep.equal([]);

      const gas = resolveSettingDescriptors('LogicElementSensorGas', 'Filterable');
      expect(gas).to.have.length(1);
      expect(gas[0]).to.include({ field: 'SelectedTag', type: 'element', elementForceTag: 'Gas' });

      expect(
        resolveSettingDescriptors('SolidConduitElementSensor', 'Filterable')[0].elementForceTag
      ).to.equal('Solid');
      expect(
        resolveSettingDescriptors('GasFilter', 'Filterable')[0].elementForceTag
      ).to.equal('Gas');
    });

    it('leaves Filterable on a non-filterable building as the plain catalogue entry', () => {
      expect(resolveSettingDescriptors('LogicSwitch', 'Filterable')).to.equal(
        SETTINGS_CATALOG.Filterable
      );
      expect(resolveSettingDescriptors('LogicSwitch', 'Filterable')[0].elementForceTag).to.equal(
        undefined
      );
    });

    it('is the primary settings key, for both sensors and filters', () => {
      for (const prefab of ['LogicElementSensorLiquid', 'LiquidFilter'])
        expect(primarySettingsKey(prefab)).to.deep.equal({ key: 'Filterable', label: 'Element' });
    });

    it('is creatable from scratch with SelectedTag Void', () => {
      expect(creatableSettingsKeysFor('GasConduitElementSensor')).to.deep.equal(['Filterable']);
      expect(
        getCreatableSettingDefaults('GasConduitElementSensor', 'Filterable')
      ).to.deep.equal({ SelectedTag: 'Void' });
    });

    // The table first shipped with 7 of these and the game declares more, which
    // is not a failure any of the specs above could see: a missing prefab still
    // renders an Element row (the catalogue has the key), it just falls back to
    // the default element pool and loses its Set button, because the creatable
    // registration only walks FILTERABLE_BUILDINGS. So assert the whole set
    // against the shipped database rather than spot-checking members.
    //
    // Carriers are every Config in the decompile that assigns
    // `Filterable.filterElementState`, plus the three DevPumps, which get theirs
    // from DevPump.OnSpawn. The phase on each line is that Config's own value.
    const FILTERABLE_CARRIERS: Record<string, string> = {
      LogicElementSensorGas: 'Gas',
      LogicElementSensorLiquid: 'Liquid',
      GasConduitElementSensor: 'Gas',
      LiquidConduitElementSensor: 'Liquid',
      SolidConduitElementSensor: 'Solid',
      GasFilter: 'Gas',
      LiquidFilter: 'Liquid',
      SolidFilter: 'Solid',
      RocketInteriorGasOutput: 'Gas',
      RocketInteriorLiquidOutput: 'Liquid',
      RocketInteriorSolidOutput: 'Solid',
      DevPumpGas: 'Gas',
      DevPumpLiquid: 'Liquid',
      DevPumpSolid: 'Solid',
    };

    it('covers every Filterable carrier the shipped database actually contains', () => {
      loadGameDatabase();
      const known = new Set(OniItem.oniItems.map(item => item.id));

      // Only assert on carriers the database ships; one absent upstream is not
      // this table's problem, and hardcoding it would rot on the next import.
      const shipped = Object.keys(FILTERABLE_CARRIERS).filter(id => known.has(id));
      expect(shipped.length, 'database should ship these carriers').to.be.greaterThan(10);

      for (const prefabId of shipped) {
        const descriptors = resolveSettingDescriptors(prefabId, 'Filterable');
        expect(descriptors[0].elementForceTag, prefabId).to.equal(FILTERABLE_CARRIERS[prefabId]);
        expect(creatableSettingsKeysFor(prefabId), prefabId).to.deep.equal(['Filterable']);
      }
    });

    // The other direction: nothing in the table that the database does not ship,
    // which would be a typo nobody notices because the entry simply never fires.
    it('names only prefabs that exist in database-2024.json', () => {
      loadGameDatabase();
      const known = new Set(OniItem.oniItems.map(item => item.id));
      for (const prefabId of Object.keys(FILTERABLE_BUILDINGS))
        expect(known.has(prefabId), prefabId).to.equal(true);
    });
  });
});

describe('formatBuildingDataEntry', function () {
  it('returns null for a Key outside the curated catalogue', () => {
    const entry: BniBuildingData = { Key: 'PixelPack', Value: { colorSettings: [] } };
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

  // Issue #238, verified in game on all three carriers. The stored value is the
  // side screen's own number (0-100), and the field names are inverted against
  // it: ActivateValue is the HIGH threshold. Both halves are asserted here
  // because the old catalogue got the second one backwards while looking right.
  it('labels IActivationRangeTarget high/low and shows the stored percent as-is', () => {
    const rows = formatBuildingDataEntry({
      Key: 'IActivationRangeTarget',
      Value: { ActivateValue: 80, DeactivateValue: 20 },
    })!;
    expect(rows).to.deep.equal([
      { field: 'ActivateValue', label: 'High threshold', text: '80%' },
      { field: 'DeactivateValue', label: 'Low threshold', text: '20%' },
    ]);
  });

  it('does not rescale IActivationRangeTarget, whose stored value is already 0-100', () => {
    for (const field of ['ActivateValue', 'DeactivateValue']) {
      const descriptor = SETTINGS_CATALOG.IActivationRangeTarget.find(d => d.field == field)!;
      // `unit: '%'` would have put it through displayScaleOf's x100; unitSuffix
      // is display-only, which is why the descriptor uses that instead.
      expect(descriptor.unit).to.equal(undefined);
      expect(toDisplayValue(descriptor, 80)).to.equal(80);
      expect(toStoredValue(descriptor, 80)).to.equal(80);
    }
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

  it('formats a Filterable element as its raw id, and Void as None', () => {
    const oxygen = formatBuildingDataEntry(
      { Key: 'Filterable', Value: { SelectedTag: 'Oxygen' } },
      'LogicElementSensorGas'
    )!;
    expect(oxygen).to.deep.equal([{ field: 'SelectedTag', label: 'Element', text: 'Oxygen' }]);

    const none = formatBuildingDataEntry(
      { Key: 'Filterable', Value: { SelectedTag: 'Void' } },
      'LogicElementSensorGas'
    )!;
    expect(none[0].text).to.equal('None');
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
        'LogicHEPSensor',
        'LogicLightSensor',
        'LogicPressureSensorGas',
        'LogicPressureSensorLiquid',
        'LogicRadiationSensor',
        'LogicTemperatureSensor',
        'LogicWattageSensor',
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

  // The wattage and radbolt sensors are the other shape: a real IThresholdSwitch
  // carrier whose stored number is already what the side screen showed, so the
  // entry exists for the label and bounds and must NOT introduce a conversion.
  it('leaves wattage and radbolt thresholds unconverted', () => {
    const watts = resolveSettingDescriptors('LogicWattageSensor', 'IThresholdSwitch').find(
      d => d.field == 'Threshold'
    )!;
    expect(watts.labelKey).to.equal('Wattage');
    expect(watts.unitSuffix).to.equal('W');
    expect(toDisplayValue(watts, 1234)).to.equal(1234);
    expect(toStoredValue(watts, 1234)).to.equal(1234);
    // 1.5x a heavi-watt wire's 50 kW rating.
    expect(watts.max).to.equal(75000);

    const radbolts = resolveSettingDescriptors('LogicHEPSensor', 'IThresholdSwitch').find(
      d => d.field == 'Threshold'
    )!;
    expect(radbolts.labelKey).to.equal('Radbolt');
    expect(radbolts.unitSuffix).to.equal('radbolts');
    expect(toDisplayValue(radbolts, 12)).to.equal(12);
    expect(radbolts.max).to.equal(500);
  });

  it('suppresses the stowaway Switch on both of them too', () => {
    expect(resolveSettingDescriptors('LogicWattageSensor', 'Switch')).to.deep.equal([]);
    expect(resolveSettingDescriptors('LogicHEPSensor', 'Switch')).to.deep.equal([]);
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
    expect(
      formatBuildingDataEntry({ Key: 'PixelPack', Value: {} }, 'LogicPressureSensorGas')
    ).to.equal(null);
  });

  it('formats wattage and radbolt thresholds with their own suffix', () => {
    const watts = formatBuildingDataEntry(
      { Key: 'IThresholdSwitch', Value: { Threshold: 1500, ActivateAboveThreshold: true } },
      'LogicWattageSensor'
    )!;
    expect(watts.find(r => r.field == 'Threshold')!.text).to.equal('1500 W');

    const radbolts = formatBuildingDataEntry(
      { Key: 'IThresholdSwitch', Value: { Threshold: 12, ActivateAboveThreshold: false } },
      'LogicHEPSensor'
    )!;
    expect(radbolts.find(r => r.field == 'Threshold')!.text).to.equal('12 radbolts');
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

});

describe('critter sensor buildingData round-trip', function () {
  before(function () {
    loadGameDatabase();
  });

  const withEcho = () => {
    const item = BlueprintHelpers.createInstance('LogicCritterCountSensor')!;
    item.buildingData = [
      { Key: 'Switch', Value: { switchedOn: true } },
      {
        Key: 'LogicCritterCountSensor',
        Value: {
          countThreshold: 7,
          activateOnGreaterThan: false,
          countCritters: true,
          countEggs: false,
        },
      },
      { Key: 'IThresholdSwitch', Value: { Threshold: 7, ActivateAboveThreshold: false } },
    ];
    return item;
  };

  it('mirrors a countThreshold edit onto an existing IThresholdSwitch echo', () => {
    const item = withEcho();
    item.setBuildingSetting('LogicCritterCountSensor', 'countThreshold', 12);
    expect(
      item.buildingData!.find(e => e.Key == 'LogicCritterCountSensor')!.Value.countThreshold
    ).to.equal(12);
    expect(item.buildingData!.find(e => e.Key == 'IThresholdSwitch')!.Value.Threshold).to.equal(12);
  });

  it('mirrors an activateOnGreaterThan edit onto the echo', () => {
    const item = withEcho();
    item.setBuildingSetting('LogicCritterCountSensor', 'activateOnGreaterThan', true);
    expect(
      item.buildingData!.find(e => e.Key == 'IThresholdSwitch')!.Value.ActivateAboveThreshold
    ).to.equal(true);
  });

  it('does not touch the echo for a countCritters/countEggs edit', () => {
    const item = withEcho();
    item.setBuildingSetting('LogicCritterCountSensor', 'countCritters', false);
    expect(item.buildingData!.find(e => e.Key == 'IThresholdSwitch')!.Value).to.deep.equal({
      Threshold: 7,
      ActivateAboveThreshold: false,
    });
  });

  it('never creates an echo when the file does not carry one', () => {
    const item = BlueprintHelpers.createInstance('LogicCritterCountSensor')!;
    item.buildingData = [
      {
        Key: 'LogicCritterCountSensor',
        Value: {
          countThreshold: 3,
          activateOnGreaterThan: true,
          countCritters: true,
          countEggs: true,
        },
      },
    ];
    item.setBuildingSetting('LogicCritterCountSensor', 'countThreshold', 9);
    expect(item.buildingData!.map(e => e.Key)).to.deep.equal(['LogicCritterCountSensor']);
  });

  it('creates its own Key from scratch with the real game defaults', () => {
    const item = BlueprintHelpers.createInstance('LogicCritterCountSensor')!;
    expect(item.addBuildingSetting('LogicCritterCountSensor')).to.equal(true);
    expect(item.buildingData!.find(e => e.Key == 'LogicCritterCountSensor')!.Value).to.deep.equal({
      countThreshold: 0,
      activateOnGreaterThan: true,
      countCritters: true,
      countEggs: true,
    });
  });
});

describe('element sensor buildingData round-trip', function () {
  before(function () {
    loadGameDatabase();
  });

  it('round-trips a picked element through Filterable.SelectedTag', () => {
    const item = BlueprintHelpers.createInstance('LogicElementSensorGas')!;
    item.setBuildingSetting('Filterable', 'SelectedTag', 'Oxygen');
    expect(item.buildingData!.find(e => e.Key == 'Filterable')!.Value).to.deep.equal({
      SelectedTag: 'Oxygen',
    });

    const blueprint = new Blueprint();
    blueprint.blueprintItems = [item];
    const building = blueprint.toBniBlueprint('x').buildings![0];
    expect(building.buildingData).to.deep.include({
      Key: 'Filterable',
      Value: { SelectedTag: 'Oxygen' },
    });
  });

  it('creates Filterable from scratch with SelectedTag Void', () => {
    const item = BlueprintHelpers.createInstance('SolidConduitElementSensor')!;
    expect(item.addBuildingSetting('Filterable')).to.equal(true);
    expect(item.buildingData!.find(e => e.Key == 'Filterable')!.Value).to.deep.equal({
      SelectedTag: 'Void',
    });
  });

  it('BuildableElement.getElementById resolves a stored SelectedTag without throwing', () => {
    expect(BuildableElement.getElementById('Oxygen')?.id).to.equal('Oxygen');
    expect(BuildableElement.getElementById('NotAnElement')).to.equal(undefined);
  });
});

// `acceptedTagSet` is stored serialized, as the JSON string the mod writes and
// reads back with `t1.Value<string>()`. We follow that format exactly. These
// specs are that constraint, expressed as tests.
describe('TreeFilterable accepted-materials filter', function () {
  it('decodes the JSON-string shape the mod writes', () => {
    const raw = '[{"Name":"Cuprite","IsValid":true},{"Name":"Ice","IsValid":true}]';
    expect(decodeTagSet(raw)).to.deep.equal([
      { Name: 'Cuprite', IsValid: true },
      { Name: 'Ice', IsValid: true },
    ]);
  });

  it('decodes the real stored filter in the sample export fixture', () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../fixtures/bpv2-example-meta.blueprint'), 'utf8')
    );
    const entry = fixture.buildings
      .flatMap((b: any) => b.buildingData ?? [])
      .find((e: BniBuildingData) => e.Key == 'TreeFilterable' && e.Value?.acceptedTagSet);
    // It carries critter/seed tags rather than elements -- the case that stops
    // this being an element list.
    expect(typeof entry.Value.acceptedTagSet).to.equal('string');
    const names = decodeTagSet(entry.Value.acceptedTagSet).map(t => t.Name);
    expect(names).to.include('HatchEgg');
    expect(names.every(n => BuildableElement.getElementById(n) == null)).to.equal(true);
  });

  it('never throws on a malformed or absent value', () => {
    for (const raw of ['', 'not json', '{}', null, undefined, 42, [1, 2], [{ Name: 'Ice' }]])
      expect(decodeTagSet(raw)).to.deep.equal([]);
  });

  it('drops duplicates, as the HashSet<Tag> on the mod side would', () => {
    const tags = decodeTagSet('[{"Name":"Ice"},{"Name":"Ice"},{"Name":"Cuprite"}]');
    expect(tags.map(t => t.Name)).to.deep.equal(['Ice', 'Cuprite']);
  });

  it('always encodes to the string shape the mod can read', () => {
    const encoded = encodeTagSet([{ Name: 'Cuprite', IsValid: true }]);
    expect(encoded).to.be.a('string');
    expect(JSON.parse(encoded)).to.deep.equal([{ Name: 'Cuprite', IsValid: true }]);
  });

  it('formats the filter as its tag names', () => {
    const rows = formatBuildingDataEntry({
      Key: 'TreeFilterable',
      Value: {
        acceptedTagSet: '[{"Name":"Cuprite","IsValid":true},{"Name":"Ice","IsValid":true}]',
        onlyFetchMarkedItems: false,
      },
    })!;
    expect(rows.find(r => r.field == 'acceptedTagSet')!.text).to.equal('Cuprite, Ice');
    expect(rows.find(r => r.field == 'onlyFetchMarkedItems')!.text).to.equal('Off');
  });

  it('formats an empty filter as None', () => {
    const rows = formatBuildingDataEntry({
      Key: 'TreeFilterable',
      Value: { acceptedTagSet: '[]', onlyFetchMarkedItems: false },
    })!;
    expect(rows.find(r => r.field == 'acceptedTagSet')!.text).to.equal('None');
  });
});

describe('TreeFilterable round-trip', function () {
  before(function () {
    loadGameDatabase();
  });

  it('exports an edited filter as the string shape, with the other field untouched', () => {
    const item = BlueprintHelpers.createInstance('SolidConduitInbox')!;
    item.buildingData = [
      {
        Key: 'TreeFilterable',
        Value: { acceptedTagSet: '[{"Name":"Cuprite","IsValid":true}]', onlyFetchMarkedItems: true },
      },
    ];
    item.setBuildingSetting(
      'TreeFilterable',
      'acceptedTagSet',
      encodeTagSet([
        { Name: 'Cuprite', IsValid: true },
        { Name: 'Copper', IsValid: true },
      ])
    );

    const blueprint = new Blueprint();
    blueprint.blueprintItems = [item];
    const building = blueprint.toBniBlueprint('x').buildings![0];
    const value = building.buildingData!.find(e => e.Key == 'TreeFilterable')!.Value;

    expect(value.acceptedTagSet).to.equal(
      '[{"Name":"Cuprite","IsValid":true},{"Name":"Copper","IsValid":true}]'
    );
    // setBuildingSetting replaces one field and keeps the rest verbatim, which
    // matters here because the mod applies the two fields independently.
    expect(value.onlyFetchMarkedItems).to.equal(true);
  });

  // Confirmed in game: a freshly built Conveyor Loader and Smart Storage Bin
  // both store an empty acceptedTagSet, and so does a loader whose filter panel
  // was opened without a selection. So the empty default is the game's own and
  // creating the key changes nothing -- which is what lets it onto this list.
  it('creates the key with the empty default the game itself writes', () => {
    for (const prefabId of ['SolidConduitInbox', 'StorageLockerSmart']) {
      expect(creatableSettingsKeysFor(prefabId)).to.include('TreeFilterable');
      expect(getCreatableSettingDefaults(prefabId, 'TreeFilterable')).to.deep.equal({
        acceptedTagSet: '[]',
        onlyFetchMarkedItems: false,
      });
      // The stored default round-trips to an empty set, not to a broken one.
      expect(decodeTagSet('[]')).to.deep.equal([]);
      expect(primarySettingsKey(prefabId)).to.deep.equal({
        key: 'TreeFilterable',
        label: 'Filter',
      });
    }
  });

  it('adds the key to an editor-placed loader with the game default', () => {
    const item = BlueprintHelpers.createInstance('SolidConduitInbox')!;
    expect(item.addBuildingSetting('TreeFilterable')).to.equal(true);
    expect(item.buildingData!.find(e => e.Key == 'TreeFilterable')!.Value).to.deep.equal({
      acceptedTagSet: '[]',
      onlyFetchMarkedItems: false,
    });
  });

  it('leaves a non-carrier alone', () => {
    expect(creatableSettingsKeysFor('GasPump')).to.not.include('TreeFilterable');
    expect(primarySettingsKey('GasPump')).to.equal(null);
  });
});

// The game's side screen (AUTOMATABLE_SIDE_SCREEN.ALLOWMANUALBUTTON) says
// "Allow Manual Use", and it is ticked when the stored automationOnly is
// FALSE. Showing the raw field would have the player read every value
// backwards -- the same class of mismatch as #238's activation range.
describe('Automatable is shown as the game shows it', function () {
  it('labels the row Allow Manual Use and negates the stored value', () => {
    const descriptor = SETTINGS_CATALOG.Automatable[0];
    expect(descriptor.labelKey).to.equal('Allow Manual Use');
    expect(descriptor.invert).to.equal(true);

    expect(
      formatBuildingDataEntry({ Key: 'Automatable', Value: { automationOnly: true } })![0].text
    ).to.equal('Off');
    expect(
      formatBuildingDataEntry({ Key: 'Automatable', Value: { automationOnly: false } })![0].text
    ).to.equal('On');
  });

  it('leaves every other boolean alone', () => {
    expect(
      formatBuildingDataEntry({ Key: 'Switch', Value: { switchedOn: true } })![0].text
    ).to.equal('On');
  });
});

// Six of the seven Keys the Blueprints Included gap doc asked for; the seventh,
// StorageTile, has its own block below. Their Value shapes are read off the
// repo's real mod export (bpv2-example-meta.blueprint) -- except LimitValve.Limit,
// which the fixture does not contain and is read off the mod source
// (DataTransfer_LimitValve: `{ Limit }`, a float) -- and their ranges from the
// game export (OniItem.settings).
describe('range-carrying settings (Prioritizable, Door, Valve, LimitValve, capacity, name)', function () {
  let fixture: any;
  const dataOf = (buildingdef: string, key: string): BniBuildingData =>
    fixture.buildings
      .filter((b: any) => b.buildingdef == buildingdef)
      .flatMap((b: any) => b.buildingData ?? [])
      .find((entry: BniBuildingData) => entry.Key == key);
  const descriptor = (prefabId: string, key: string) => resolveSettingDescriptors(prefabId, key)[0];

  before(function () {
    loadGameDatabase();
    fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../fixtures/bpv2-example-meta.blueprint'), 'utf8')
    );
  });

  it('knows all six keys', () => {
    for (const key of [
      'Prioritizable',
      'Door',
      'Valve',
      'LimitValve',
      'IUserControlledCapacity',
      'UserNameable',
    ])
      expect(isKnownSettingsKey(key), key).to.equal(true);
  });

  it('carries the export ranges onto the building', () => {
    expect(OniItem.getOniItem('LiquidValve').settings!.valve).to.deep.equal({
      conduitType: 'Liquid',
      maxFlow: 10,
    });
    expect(OniItem.getOniItem('GasValve').settings!.valve!.maxFlow).to.equal(1);
    expect(OniItem.getOniItem('SolidLimitValve').settings!.limitValve).to.deep.equal({
      conduitType: 'Solid',
      maxLimitKg: 500,
      displayUnitsInsteadOfMass: true,
    });
    expect(OniItem.getOniItem('StorageTile').settings!.userControlledCapacity).to.deep.include({
      maxCapacity: 1000,
      units: 'kg',
      source: 'StorageTile.Def',
    });
    expect(OniItem.getOniItem('BunkerDoor').settings!.door!.allowAutoControl).to.equal(false);
    expect(OniItem.getOniItem('StorageLocker').settings!.prioritizable).to.equal(true);
    expect(OniItem.getOniItem('StorageLocker').settings!.userNameable).to.equal(true);
    // A wire accepts none of them.
    expect(OniItem.getOniItem('Wire').settings).to.equal(undefined);
  });

  describe('Prioritizable', () => {
    it('reads the priority out of the serialized setting in the real export', () => {
      const entry = dataOf('LiquidBottler', 'Prioritizable');
      expect(entry.Value.masterPrioritySetting).to.be.a('string');
      expect(readSettingField(descriptor('LiquidBottler', 'Prioritizable'), entry.Value)).to.equal(9);
      expect(formatBuildingDataEntry(entry, 'LiquidBottler')).to.deep.equal([
        { field: 'masterPrioritySetting', label: 'Priority', text: '9' },
      ]);
    });

    it('bounds the priority 1-9', () => {
      const d = descriptor('LiquidBottler', 'Prioritizable');
      expect([d.type, d.min, d.max]).to.deep.equal(['int', 1, 9]);
    });

    it('rewrites only the priority, keeping the class and the serialized form', () => {
      const entry = dataOf('LiquidBottler', 'Prioritizable');
      const written = writeSettingField(
        descriptor('LiquidBottler', 'Prioritizable'),
        entry.Value,
        3
      );
      expect(written).to.equal('{"priority_class":0,"priority_value":3}');
    });

    it('writing back the stored value reproduces the mod\'s own bytes', () => {
      const entry = dataOf('LiquidBottler', 'Prioritizable');
      expect(
        writeSettingField(descriptor('LiquidBottler', 'Prioritizable'), entry.Value, 9)
      ).to.equal(entry.Value.masterPrioritySetting);
    });

    // The writer holds to the reader's contract: what does not read back is not
    // writable. Otherwise a direct caller could overwrite a top-priority entry's
    // value, or rebuild a malformed string into a priority with no class.
    it('refuses to write a priority it would not show', () => {
      const d = descriptor('Tile', 'Prioritizable');
      const emergency = { masterPrioritySetting: '{"priority_class":3,"priority_value":1}' };
      expect(() => writeSettingField(d, emergency, 5)).to.throw(/not writable/);
      for (const masterPrioritySetting of ['', 'not json', '[1,2]', 'null', 42, null, undefined])
        expect(
          () => writeSettingField(d, { masterPrioritySetting }, 5),
          JSON.stringify(masterPrioritySetting)
        ).to.throw(/not writable/);
      expect(() => writeSettingField(d, undefined, 5)).to.throw(/not writable/);
      // ...and leaves what it was handed untouched.
      expect(emergency.masterPrioritySetting).to.equal('{"priority_class":3,"priority_value":1}');
    });

    it('writes an ordinary field through unchanged, whatever the stored value', () => {
      const d = descriptor('LiquidValve', 'Valve');
      expect(writeSettingField(d, undefined, 2.5)).to.equal(2.5);
      expect(writeSettingField(d, { DesiredFlow: 'garbage' }, 2.5)).to.equal(2.5);
    });

    it('shows nothing for a priority outside the basic class, and still calls the key known', () => {
      const emergency: BniBuildingData = {
        Key: 'Prioritizable',
        Value: { masterPrioritySetting: '{"priority_class":3,"priority_value":1}' },
      };
      expect(readSettingField(descriptor('Tile', 'Prioritizable'), emergency.Value)).to.equal(
        undefined
      );
      expect(formatBuildingDataEntry(emergency, 'Tile')).to.deep.equal([]);
    });

    it('shows nothing, and does not throw, for a malformed serialized setting', () => {
      for (const masterPrioritySetting of ['', 'not json', '[1,2]', 'null', 42, null])
        expect(
          formatBuildingDataEntry(
            { Key: 'Prioritizable', Value: { masterPrioritySetting } },
            'Tile'
          )
        ).to.deep.equal([]);
    });

    it('applies to any building, since in a blueprint it is the build priority', () => {
      expect(resolveSettingDescriptors('Wire', 'Prioritizable')).to.have.length(1);
    });

    it('full loop: an edited priority reaches the exported file, class intact', () => {
      const blueprint = new Blueprint();
      blueprint.importFromBni(fixture);
      const bottler = blueprint.blueprintItems.find(
        item => item.id == 'LiquidBottler' && item.buildingData?.some(e => e.Key == 'Prioritizable')
      )!;
      const d = descriptor('LiquidBottler', 'Prioritizable');
      const stored = bottler.buildingData!.find(e => e.Key == 'Prioritizable')!.Value;
      bottler.setBuildingSetting('Prioritizable', d.field, writeSettingField(d, stored, 2));

      const exported = blueprint
        .toBniBlueprint('edited')
        .buildings.flatMap(b => b.buildingData ?? [])
        .find(e => e.Key == 'Prioritizable')!;
      expect(exported.Value).to.deep.equal({
        masterPrioritySetting: '{"priority_class":0,"priority_value":2}',
      });
    });
  });

  describe('Door', () => {
    it('names the three states of the real export\'s airlock', () => {
      const entry = dataOf('PressureDoor', 'Door');
      expect(entry.Value).to.deep.equal({ requestedState: 0 });
      expect(formatBuildingDataEntry(entry, 'PressureDoor')).to.deep.equal([
        { field: 'requestedState', label: 'Door', text: 'Auto' },
      ]);
      expect(descriptor('PressureDoor', 'Door').enumLabels).to.deep.equal({
        0: 'Auto',
        1: 'Open',
        2: 'Locked',
      });
    });

    it('does not offer Auto on a door the game cannot automate', () => {
      expect(descriptor('BunkerDoor', 'Door').enumLabels).to.deep.equal({ 1: 'Open', 2: 'Locked' });
      // ...without disturbing the shared catalogue entry.
      expect(SETTINGS_CATALOG.Door[0].enumLabels).to.have.property('0', 'Auto');
    });

    it('formats a state it has no word for as the raw number', () => {
      expect(
        formatBuildingDataEntry({ Key: 'Door', Value: { requestedState: 7 } }, 'PressureDoor')
      ).to.deep.equal([{ field: 'requestedState', label: 'Door', text: '7' }]);
    });
  });

  describe('Valve', () => {
    it('shows the real export\'s flow in grams per second', () => {
      const entry = dataOf('LiquidValve', 'Valve');
      expect(entry.Value).to.deep.equal({ DesiredFlow: 4.832 });
      expect(formatBuildingDataEntry(entry, 'LiquidValve')).to.deep.equal([
        { field: 'DesiredFlow', label: 'Flow rate', text: '4832 g/s' },
      ]);
    });

    it('takes its maximum from the prefab: 10 kg/s liquid, 1 kg/s gas', () => {
      const liquid = descriptor('LiquidValve', 'Valve');
      expect(liquid.max).to.equal(10);
      expect(toDisplayValue(liquid, liquid.max!)).to.equal(10000);
      const gas = descriptor('GasValve', 'Valve');
      expect(toDisplayValue(gas, gas.max!)).to.equal(1000);
    });

    it('round-trips display and stored values', () => {
      const d = descriptor('LiquidValve', 'Valve');
      expect(toStoredValue(d, 2500)).to.equal(2.5);
      expect(toDisplayValue(d, 2.5)).to.equal(2500);
    });

    it('stays unbounded above on a building the export records no valve for', () => {
      expect(descriptor('Tile', 'Valve').max).to.equal(undefined);
    });
  });

  describe('LimitValve', () => {
    it('is a mass on the gas and liquid meter valves', () => {
      for (const prefabId of ['GasLimitValve', 'LiquidLimitValve']) {
        const d = descriptor(prefabId, 'LimitValve');
        expect([d.type, d.max, d.unitSuffix], prefabId).to.deep.equal(['float', 500, 'kg']);
      }
      expect(
        formatBuildingDataEntry({ Key: 'LimitValve', Value: { Limit: 120.5 } }, 'LiquidLimitValve')
      ).to.deep.equal([{ field: 'Limit', label: 'Limit', text: '120.5 kg' }]);
    });

    it('is a whole unit count on the conveyor meter', () => {
      const d = descriptor('SolidLimitValve', 'LimitValve');
      expect([d.type, d.max, d.unitSuffix]).to.deep.equal(['int', 500, 'units']);
    });
  });

  describe('IUserControlledCapacity', () => {
    it('shows the real export\'s bottler capacity in kg, bounded by the prefab', () => {
      const entry = dataOf('LiquidBottler', 'IUserControlledCapacity');
      expect(entry.Value).to.deep.equal({ UserMaxCapacity: 200 });
      expect(formatBuildingDataEntry(entry, 'LiquidBottler')).to.deep.equal([
        { field: 'UserMaxCapacity', label: 'Max capacity', text: '200 kg' },
      ]);
      const d = descriptor('LiquidBottler', 'IUserControlledCapacity');
      expect([d.min, d.max, d.type]).to.deep.equal([0, 200, 'float']);
    });

    it('counts whole critters on a critter drop-off', () => {
      const d = descriptor('CritterDropOff', 'IUserControlledCapacity');
      expect([d.type, d.max, d.unitSuffix]).to.deep.equal(['int', 40, 'critters']);
    });

    it('counts radbolts on the radbolt engine', () => {
      const d = descriptor('HEPEngine', 'IUserControlledCapacity');
      expect([d.max, d.unitSuffix]).to.deep.equal([4000, 'radbolts']);
    });

    it('bounds the storage tile by StorageTile.Def', () => {
      const d = descriptor('StorageTile', 'IUserControlledCapacity');
      expect([d.min, d.max, d.unitSuffix]).to.deep.equal([0, 1000, 'kg']);
    });

    it('gives every building with a recorded capacity a suffix the panel can render', () => {
      for (const item of OniItem.oniItems.filter(i => i.settings?.userControlledCapacity != null)) {
        const d = descriptor(item.id, 'IUserControlledCapacity');
        expect(['kg', 'critters', 'radbolts'], item.id).to.include(d.unitSuffix);
        expect(d.max, item.id).to.be.greaterThan(0);
      }
    });
  });

  describe('UserNameable', () => {
    it('shows the stored name verbatim, markup included', () => {
      const entry = dataOf('StorageLocker', 'UserNameable');
      expect(formatBuildingDataEntry(entry, 'StorageLocker')).to.deep.equal([
        { field: 'savedName', label: 'Name', text: entry.Value.savedName },
      ]);
    });

    it('carries no length bound, so an untouched name can never be truncated', () => {
      expect(descriptor('StorageLocker', 'UserNameable').max).to.equal(undefined);
    });
  });

  it('none of the six is creatable from scratch: their in-game defaults are unverified', () => {
    for (const prefabId of ['LiquidValve', 'PressureDoor', 'StorageLocker', 'LiquidBottler'])
      for (const key of creatableSettingsKeysFor(prefabId))
        expect(
          ['Prioritizable', 'Door', 'Valve', 'LimitValve', 'IUserControlledCapacity', 'UserNameable'],
          `${prefabId} ${key}`
        ).to.not.include(key);
  });

  it('round-trips every one of them through the site untouched', () => {
    const source = new Blueprint();
    source.importFromBni(fixture);
    const reimported = new Blueprint();
    reimported.importFromMdb(source.toMdbBlueprint());
    const keys = ['Prioritizable', 'Door', 'Valve', 'IUserControlledCapacity', 'UserNameable'];
    const pick = (buildings: any[]) =>
      buildings.flatMap(b => (b.buildingData ?? []).filter((e: any) => keys.includes(e.Key)));
    expect(pick(reimported.toBniBlueprint('roundtrip').buildings)).to.deep.equal(
      pick(fixture.buildings)
    );
  });
});

// Issues #254 and #268: the Storage Tile's own Key and the two radbolt sliders.
//
// Shapes come from the BlueprintsV2 source, not a capture: DataTransferHelpers.cs
// at Sgt-Imalas/Sgt_Imalas-Oni-Mods@12fed6b6 (the last public copy, before the
// mod moved to a private submodule in 1e1c757b):
//
//   DataTransfer_StorageTile                 { TargetTag: string, UserMaxCapacity: float }
//   DataTransfer_HEPBattery                  { particleThreshold: float }
//   DataTransfer_HighEnergyParticleSpawner   { Direction: int, particleThreshold: float }
//
// The values below are the non-round ones the capture checklist asks for, so the
// in-game copy can replace this inline blueprint field for field.
describe('Storage Tile and radbolt threshold settings (#254, #268)', function () {
  const building = (buildingdef: string, x: number, buildingData: BniBuildingData[]) => ({
    offset: { x, y: 0 },
    buildingdef,
    selected_elements: [],
    buildingData,
  });
  const sourceShaped = () => ({
    friendlyname: 'storage and radbolts',
    buildings: [
      building('StorageTile', 0, [
        { Key: 'StorageTile', Value: { TargetTag: 'Cuprite', UserMaxCapacity: 734.5 } },
      ]),
      building('HEPBattery', 2, [{ Key: 'HEPBattery', Value: { particleThreshold: 47 } }]),
      building('HighEnergyParticleSpawner', 6, [
        { Key: 'HighEnergyParticleSpawner', Value: { Direction: 2, particleThreshold: 83 } },
      ]),
    ],
    digcommands: [],
  });
  const settingOf = (buildings: any[], key: string) =>
    buildings.flatMap(b => b.buildingData ?? []).find((e: BniBuildingData) => e.Key == key);
  const descriptor = (prefabId: string, key: string, field: string) =>
    resolveSettingDescriptors(prefabId, key).find(d => d.field == field)!;

  before(function () {
    loadGameDatabase();
  });

  it('knows all three Keys', () => {
    for (const key of ['StorageTile', 'HEPBattery', 'HighEnergyParticleSpawner'])
      expect(isKnownSettingsKey(key), key).to.equal(true);
  });

  describe('StorageTile', () => {
    it('shows the item the tile holds and its capacity', () => {
      expect(
        formatBuildingDataEntry(settingOf(sourceShaped().buildings, 'StorageTile'), 'StorageTile')
      ).to.deep.equal([
        { field: 'TargetTag', label: 'Filter', text: 'Cuprite' },
        { field: 'UserMaxCapacity', label: 'Max capacity', text: '734.5 kg' },
      ]);
    });

    it('picks the item from solids, and shows an unset or empty tag as None', () => {
      expect(descriptor('StorageTile', 'StorageTile', 'TargetTag')).to.deep.include({
        type: 'element',
        elementForceTag: 'Solid',
      });
      for (const TargetTag of ['Void', '', null])
        expect(
          formatBuildingDataEntry(
            { Key: 'StorageTile', Value: { TargetTag, UserMaxCapacity: 1000 } },
            'StorageTile'
          )![0].text,
          String(TargetTag)
        ).to.equal('None');
    });

    // The tile can hold things the site has no element for; the raw tag is
    // shown rather than hidden.
    it('shows a tag it cannot resolve by its raw name', () => {
      expect(
        formatBuildingDataEntry(
          { Key: 'StorageTile', Value: { TargetTag: 'BasicFabric', UserMaxCapacity: 1000 } },
          'StorageTile'
        )![0].text
      ).to.equal('BasicFabric');
    });

    it('bounds the capacity by StorageTile.Def, in stored kilograms', () => {
      const d = descriptor('StorageTile', 'StorageTile', 'UserMaxCapacity');
      expect([d.min, d.max, d.type, d.unitSuffix, d.unit]).to.deep.equal([
        0,
        1000,
        'float',
        'kg',
        undefined,
      ]);
      expect(toDisplayValue(d, 734.5)).to.equal(734.5);
      // ...without disturbing the shared catalogue entry.
      expect(SETTINGS_CATALOG.StorageTile[1].max).to.equal(undefined);
    });

    it('is unbounded above where the export records no capacity', () => {
      expect(descriptor('Tile', 'StorageTile', 'UserMaxCapacity').max).to.equal(undefined);
    });
  });

  describe('HEPBattery and HighEnergyParticleSpawner', () => {
    it('show the radbolt threshold as stored, in radbolts', () => {
      const buildings = sourceShaped().buildings;
      expect(
        formatBuildingDataEntry(settingOf(buildings, 'HEPBattery'), 'HEPBattery')
      ).to.deep.equal([
        { field: 'particleThreshold', label: 'Radbolt threshold', text: '47 radbolts' },
      ]);
      // Direction is in the Value but not the catalogue: no row for it.
      expect(
        formatBuildingDataEntry(
          settingOf(buildings, 'HighEnergyParticleSpawner'),
          'HighEnergyParticleSpawner'
        )
      ).to.deep.equal([
        { field: 'particleThreshold', label: 'Radbolt threshold', text: '83 radbolts' },
      ]);
    });

    // The #251 trap: a `unit` would put an already-display number through a scale.
    it('store display units: a suffix, no unit, no scale', () => {
      for (const key of ['HEPBattery', 'HighEnergyParticleSpawner']) {
        const d = descriptor(key, key, 'particleThreshold');
        expect([d.unit, d.displayScale, d.unitSuffix, d.min, d.max], key).to.deep.equal([
          undefined,
          undefined,
          'radbolts',
          0,
          undefined,
        ]);
        expect(toDisplayValue(d, 47), key).to.equal(47);
        expect(toStoredValue(d, 47), key).to.equal(47);
      }
    });

    // Both handlers return `new()` for a building whose state machine has not
    // started. A known Key with nothing in it renders nothing.
    it('render no row for the empty Value a building that has not started exports', () => {
      for (const key of ['HEPBattery', 'StorageTile'])
        expect(formatBuildingDataEntry({ Key: key, Value: {} }, key), key).to.deep.equal([]);
    });
  });

  it('none of them is creatable from scratch', () => {
    for (const prefabId of ['StorageTile', 'HEPBattery', 'HighEnergyParticleSpawner'])
      expect(creatableSettingsKeysFor(prefabId), prefabId).to.deep.equal([]);
  });

  it('round-trips every one of them through the site untouched', () => {
    const file = sourceShaped();
    const source = new Blueprint();
    source.importFromBni(file as any);
    const reimported = new Blueprint();
    reimported.importFromMdb(source.toMdbBlueprint());
    const exported = reimported.toBniBlueprint('roundtrip').buildings;
    for (const key of ['StorageTile', 'HEPBattery', 'HighEnergyParticleSpawner'])
      expect(settingOf(exported, key), key).to.deep.equal(settingOf(file.buildings, key));
  });

  // Each handler returns on its FIRST missing field -- StorageTile's before it
  // reads the capacity, the generator's before it reads the threshold -- so an
  // edit that dropped a sibling field would export a Value the game ignores.
  it('full loop: edits reach the exported file with every sibling field intact', () => {
    const blueprint = new Blueprint();
    blueprint.importFromBni(sourceShaped() as any);
    const item = (id: string) => blueprint.blueprintItems.find(i => i.id == id)!;

    item('StorageTile').setBuildingSetting('StorageTile', 'TargetTag', 'Sandstone');
    item('StorageTile').setBuildingSetting('StorageTile', 'UserMaxCapacity', 512.25);
    item('HEPBattery').setBuildingSetting('HEPBattery', 'particleThreshold', 61);
    item('HighEnergyParticleSpawner').setBuildingSetting(
      'HighEnergyParticleSpawner',
      'particleThreshold',
      150
    );

    const reimported = new Blueprint();
    reimported.importFromMdb(blueprint.toMdbBlueprint());
    const exported = reimported.toBniBlueprint('edited').buildings;
    expect(settingOf(exported, 'StorageTile').Value).to.deep.equal({
      TargetTag: 'Sandstone',
      UserMaxCapacity: 512.25,
    });
    expect(settingOf(exported, 'HEPBattery').Value).to.deep.equal({ particleThreshold: 61 });
    expect(settingOf(exported, 'HighEnergyParticleSpawner').Value).to.deep.equal({
      Direction: 2,
      particleThreshold: 150,
    });
  });
});

// #254 item 1, which shipped with the range-carrying settings: the Smart Storage
// Bin's capacity slider. 1234 is the value observed on one in the #251 capture
// (that file is not in the repo); the bounds are the game export's.
describe('Smart Storage Bin capacity (#254)', function () {
  before(function () {
    loadGameDatabase();
  });

  it('shows and bounds the capacity a Smart Storage Bin stores', () => {
    const entry: BniBuildingData = {
      Key: 'IUserControlledCapacity',
      Value: { UserMaxCapacity: 1234 },
    };
    expect(formatBuildingDataEntry(entry, 'StorageLockerSmart')).to.deep.equal([
      { field: 'UserMaxCapacity', label: 'Max capacity', text: '1234 kg' },
    ]);
    const d = resolveSettingDescriptors('StorageLockerSmart', 'IUserControlledCapacity')[0];
    expect([d.min, d.max, d.unit]).to.deep.equal([0, 20000, undefined]);
    expect(toStoredValue(d, 1234)).to.equal(1234);
  });
});
