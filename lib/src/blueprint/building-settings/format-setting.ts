import { BniBuildingData } from '../../io/bni/bni-building';
import {
  isKnownSettingsKey,
  resolveSettingDescriptors,
  SETTINGS_CATALOG,
  SettingFieldDescriptor,
  toDisplayValue,
} from './settings-catalog';

const CYCLE_SECONDS = 600;

export interface FormattedSettingRow {
  field: string;
  label: string;
  text: string;
}

// Trims a fixed-decimal string down to its meaningful digits: 5.00 -> "5",
// 5.10 -> "5.1". toFixed alone would print every trailing zero.
function formatNumber(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  // decimals === 0 never produces a decimal point, so every trailing zero is
  // a real digit (10 -> "10", not "1") — only trim when there's a fractional
  // part to strip.
  return decimals === 0 ? text : text.replace(/\.?0+$/, '') || '0';
}

function formatDuration(seconds: number, displayCyclesMode: boolean | undefined): string {
  const base = `${formatNumber(seconds, 2)} s`;
  if (displayCyclesMode || seconds >= CYCLE_SECONDS)
    return `${base} (~${formatNumber(seconds / CYCLE_SECONDS, 2)} cycles)`;
  return base;
}

function formatFieldValue(
  descriptor: SettingFieldDescriptor,
  raw: any,
  value: Record<string, any>
): string {
  switch (descriptor.type) {
    case 'bool':
      if (descriptor.booleanLabels != null)
        return raw ? descriptor.booleanLabels.whenTrue : descriptor.booleanLabels.whenFalse;
      return raw ? 'On' : 'Off';
    case 'string':
      return raw == null || raw === '' ? '—' : String(raw);
    case 'enum':
      return descriptor.enumLabels?.[raw] ?? String(raw);
    case 'int':
    case 'float':
      if (typeof raw !== 'number' || Number.isNaN(raw)) return String(raw);
      // A descriptor carrying an explicit suffix owns its own conversion —
      // the per-building threshold units (grams, °C, lux, germs, rads). The
      // unit switch below stays for the symbolic units that predate it.
      if (descriptor.unitSuffix != null) {
        const display = formatNumber(toDisplayValue(descriptor, raw), descriptor.decimals ?? 2);
        return descriptor.unitSuffix === '' ? display : `${display} ${descriptor.unitSuffix}`;
      }
      switch (descriptor.unit) {
        case 's':
          return formatDuration(raw, value.displayCyclesMode);
        case 'cycleFraction':
          return `${formatNumber(raw * 100, 2)}% of cycle`;
        case 'bit':
          return `Bit ${raw}`;
        case '%':
          return `${formatNumber(raw * 100, 2)}%`;
        default:
          return formatNumber(raw, descriptor.type === 'int' ? 0 : 2);
      }
  }
}

// Formats one buildingData entry's known fields for display. Returns null
// when the Key is not in the curated catalogue — the caller falls back to
// the "N other stored settings (preserved)" line for those, and for any
// entry whose shape this throws on (mods can register their own Keys through
// the ModAPI, and a game update can add fields we don't know about yet).
export function formatBuildingDataEntry(
  entry: BniBuildingData,
  prefabId?: string
): FormattedSettingRow[] | null {
  // Known-ness is a property of the Key alone; a resolved descriptor list can
  // legitimately be empty for a known key (a sensor's stowaway `Switch`), and
  // that must not read as "unrecognized" and land in the preserved-count line.
  if (!isKnownSettingsKey(entry.Key)) return null;
  const descriptors =
    prefabId != null ? resolveSettingDescriptors(prefabId, entry.Key) : SETTINGS_CATALOG[entry.Key];

  const value = entry.Value ?? {};
  const rows: FormattedSettingRow[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.hidden) continue;
    if (!(descriptor.field in value)) continue;
    try {
      rows.push({
        field: descriptor.field,
        label: descriptor.labelKey,
        text: formatFieldValue(descriptor, value[descriptor.field], value),
      });
    } catch {
      // Unrecognized shape for this field — skip it rather than fail the
      // whole panel.
    }
  }
  return rows;
}
