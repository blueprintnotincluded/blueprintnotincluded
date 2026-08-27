import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  BniBuildingData,
  formatBuildingDataEntry,
  isKnownSettingsKey,
  SETTINGS_CATALOG,
} from '../../lib/index';

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
});
