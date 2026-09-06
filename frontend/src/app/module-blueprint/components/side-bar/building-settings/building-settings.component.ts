import { Component, Input } from "@angular/core";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import {
  BlueprintItem,
  creatableSettingsKeysFor,
  formatBuildingDataEntry,
  resolveSettingDescriptors,
  SettingFieldDescriptor,
  SettingFieldType,
  settingMirrorFor,
  SettingUnit,
  thresholdSensorSpec,
  toDisplayValue,
  toStoredValue,
} from "../../../../../../../lib/index";

interface EditableSettingRow {
  key: string;
  field: string;
  // The resolved descriptor this row was built from — carried so committing an
  // edit inverts exactly the conversion that produced displayValue.
  descriptor: SettingFieldDescriptor;
  label: string;
  type: SettingFieldType;
  unit?: SettingUnit;
  // What to render after the input. Empty string means no suffix at all (a
  // bare count), which is why this is not optional-with-fallback.
  unitSuffix: string;
  step: number;
  displayValue: any;
  displayMin?: number;
  displayMax?: number;
  cycleHint: string | null;
}

interface CreatableSetting {
  key: string;
  label: string;
}

// The suffix implied by a descriptor that predates per-building units.
function legacySuffix(unit: SettingUnit | undefined): string {
  if (unit == "s") return "s";
  if (unit == "cycleFraction" || unit == "%") return "%";
  return "";
}

function suffixOf(descriptor: SettingFieldDescriptor): string {
  return descriptor.unitSuffix ?? legacySuffix(descriptor.unit);
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

const CYCLE_SECONDS = 600;

// Editable display of a building's BlueprintsV2 buildingData (timer
// durations, switch state, logic gate delays, ...) —
// spec/building-settings-plan.md phase 3. Curated keys render as editable
// rows; every other stored Key is preserved but shown only as a count, never
// dumped as raw JSON. Edits commit on blur/Enter/change, one undo step per
// completed edit, matching the world-notes editor pattern.
@Component({
  selector: "app-building-settings",
  templateUrl: "./building-settings.component.html",
  styleUrls: ["./building-settings.component.css"],
  standalone: false,
})
export class BuildingSettingsComponent {
  @Input() blueprintItem!: BlueprintItem;

  constructor(private blueprintService: BlueprintService) {}

  get hasSettings(): boolean {
    return (
      this.rows.length > 0 ||
      this.otherKeys.length > 0 ||
      this.creatableSettings.length > 0
    );
  }

  get rows(): EditableSettingRow[] {
    const present = new Set(
      (this.blueprintItem.buildingData ?? []).map((entry) => entry.Key),
    );
    const rows: EditableSettingRow[] = [];
    for (const entry of this.blueprintItem.buildingData ?? []) {
      const descriptors = resolveSettingDescriptors(
        this.blueprintItem.id,
        entry.Key,
      );
      if (descriptors.length == 0) continue;

      const value = entry.Value;
      if (value == null || typeof value !== "object") continue;

      for (const descriptor of descriptors) {
        if (descriptor.hidden) continue;
        // This field is a mirror of one already rendered under another Key
        // that the building carries (the critter sensor writes its count and
        // above/below twice). Show it once — editing either moves both.
        const mirror = settingMirrorFor(entry.Key, descriptor.field);
        if (mirror?.redundant && present.has(mirror.key)) continue;
        // Mirrors formatBuildingDataEntry: a missing field means this entry
        // is incomplete/malformed (or from a newer mod version) — skip it
        // rather than rendering an editable row backed by nothing, which
        // would crash setBuildingSetting the moment the user touched it.
        if (!(descriptor.field in value)) continue;
        const decimals =
          descriptor.decimals ?? (descriptor.type == "int" ? 0 : 2);
        const raw = value[descriptor.field];
        rows.push({
          key: entry.Key,
          field: descriptor.field,
          descriptor,
          label: descriptor.labelKey,
          type: descriptor.type,
          unit: descriptor.unit,
          unitSuffix: suffixOf(descriptor),
          step: descriptor.step ?? (descriptor.type == "int" ? 1 : 0.1),
          displayValue:
            typeof raw == "number"
              ? roundTo(toDisplayValue(descriptor, raw), decimals)
              : raw,
          // Bounds are stored-unit in the catalogue, so they go through the
          // same conversion as the value they constrain.
          displayMin:
            descriptor.min != null
              ? toDisplayValue(descriptor, descriptor.min)
              : undefined,
          displayMax:
            descriptor.max != null
              ? toDisplayValue(descriptor, descriptor.max)
              : undefined,
          cycleHint:
            descriptor.unit == "s" &&
            typeof raw == "number" &&
            raw >= CYCLE_SECONDS
              ? `~${(raw / CYCLE_SECONDS).toFixed(2)} cycles`
              : null,
        });
      }
    }
    return rows;
  }

  get otherKeys(): string[] {
    return (this.blueprintItem.buildingData ?? [])
      .filter(
        (entry) =>
          formatBuildingDataEntry(entry, this.blueprintItem.id) == null,
      )
      .map((entry) => entry.Key);
  }

  get otherKeysTooltip(): string {
    return this.otherKeys.join(", ");
  }

  // Keys this specific building can create from scratch (hand-checked
  // catalogue defaults) that it does not already have.
  get creatableSettings(): CreatableSetting[] {
    const existing = new Set(
      (this.blueprintItem.buildingData ?? []).map((entry) => entry.Key),
    );
    return creatableSettingsKeysFor(this.blueprintItem.id)
      .filter((key) => !existing.has(key))
      .map((key) => ({ key, label: this.creatableLabel(key) }));
  }

  // A threshold key names what it sets, since a building can offer more than
  // one creatable key and "Add automation settings" would not say which.
  private creatableLabel(key: string): string {
    if (key != "IThresholdSwitch") return $localize`Add automation settings`;
    const spec = thresholdSensorSpec(this.blueprintItem.id);
    return spec == null
      ? $localize`Add automation settings`
      : $localize`Set ${spec.label.toLowerCase()}:label: threshold`;
  }

  trackByCreatable(_index: number, item: CreatableSetting): string {
    return item.key;
  }

  addSetting(key: string) {
    this.blueprintItem.addBuildingSetting(key);
    this.commit();
  }

  // `rows` is a getter that rebuilds a fresh array of fresh objects on every
  // change-detection cycle (which fires on every keystroke, since the
  // (keydown.enter) binding registers a real keydown listener zone.js wakes
  // up for). Without a stable trackBy, *ngFor's default identity diffing
  // treats every row as removed-and-re-added on each cycle and tears down
  // the <input> DOM nodes mid-edit, discarding whatever the user just typed.
  trackByRow(_index: number, row: EditableSettingRow): string {
    return `${row.key}:${row.field}`;
  }

  onFieldInput(row: EditableSettingRow, rawInput: string | boolean) {
    let value: any = rawInput;
    if (row.type == "bool") {
      value = Boolean(rawInput);
    } else if (row.type == "int" || row.type == "float") {
      let num = Number(rawInput);
      if (Number.isNaN(num)) return;
      if (row.displayMin != null && num < row.displayMin) num = row.displayMin;
      if (row.displayMax != null && num > row.displayMax) num = row.displayMax;
      // Blurring an untouched input must not write. The displayed value is
      // rounded, so re-deriving a stored value from it would nudge a
      // Thermo Sensor stored at 293.153 K to 293.15 — a silent data change
      // that also detaches rawSource for nothing.
      if (num === row.displayValue) return;
      value = toStoredValue(row.descriptor, num);
      if (row.type == "int") value = Math.round(value);
    } else if (row.type == "string") {
      value = String(rawInput);
      // The template's [attr.maxlength] stops interactive typing, but not a
      // paste or a value set programmatically, so enforce the catalogue
      // bound here too before it reaches storage/export.
      if (row.displayMax != null) value = value.slice(0, row.displayMax);
    }

    this.blueprintItem.setBuildingSetting(row.key, row.field, value);
    this.commit();
  }

  private commit() {
    this.blueprintService.blueprint.emitBlueprintChanged();
  }
}
