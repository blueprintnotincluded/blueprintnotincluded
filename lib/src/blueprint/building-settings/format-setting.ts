import { BniBuildingData } from '../../io/bni/bni-building';
import { SETTINGS_CATALOG, SettingFieldDescriptor } from './settings-catalog';

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
      return raw ? 'On' : 'Off';
    case 'string':
      return raw == null || raw === '' ? '—' : String(raw);
    case 'enum':
      return descriptor.enumLabels?.[raw] ?? String(raw);
    case 'int':
    case 'float':
      if (typeof raw !== 'number' || Number.isNaN(raw)) return String(raw);
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
export function formatBuildingDataEntry(entry: BniBuildingData): FormattedSettingRow[] | null {
  const descriptors = SETTINGS_CATALOG[entry.Key];
  if (descriptors == null) return null;

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
