import { Component, Input } from "@angular/core";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import {
  BlueprintItem,
  creatableSettingsKeysFor,
  formatBuildingDataEntry,
  SETTINGS_CATALOG,
  SettingFieldType,
  SettingUnit,
} from "../../../../../../../lib/index";

// A percentage unit is stored as a 0-1 fraction (LogicTimeOfDaySensor's
// startTime/duration) but edited as a 0-100 number, matching the game's own
// side screen. Every other unit round-trips 1:1.
function displayScale(unit: SettingUnit | undefined): number {
  return unit == "cycleFraction" || unit == "%" ? 100 : 1;
}

interface EditableSettingRow {
  key: string;
  field: string;
  label: string;
  type: SettingFieldType;
  unit?: SettingUnit;
  displayValue: any;
  displayMin?: number;
  displayMax?: number;
  cycleHint: string | null;
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
      this.creatableKeys.length > 0
    );
  }

  get rows(): EditableSettingRow[] {
    const rows: EditableSettingRow[] = [];
    for (const entry of this.blueprintItem.buildingData ?? []) {
      const descriptors = SETTINGS_CATALOG[entry.Key];
      if (descriptors == null) continue;

      const value = entry.Value;
      if (value == null || typeof value !== "object") continue;

      for (const descriptor of descriptors) {
        if (descriptor.hidden) continue;
        // Mirrors formatBuildingDataEntry: a missing field means this entry
        // is incomplete/malformed (or from a newer mod version) — skip it
        // rather than rendering an editable row backed by nothing, which
        // would crash setBuildingSetting the moment the user touched it.
        if (!(descriptor.field in value)) continue;
        const scale = displayScale(descriptor.unit);
        const raw = value[descriptor.field];
        rows.push({
          key: entry.Key,
          field: descriptor.field,
          label: descriptor.labelKey,
          type: descriptor.type,
          unit: descriptor.unit,
          displayValue: typeof raw == "number" ? raw * scale : raw,
          displayMin:
            descriptor.min != null ? descriptor.min * scale : undefined,
          displayMax:
            descriptor.max != null ? descriptor.max * scale : undefined,
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
      .filter((entry) => formatBuildingDataEntry(entry) == null)
      .map((entry) => entry.Key);
  }

  get otherKeysTooltip(): string {
    return this.otherKeys.join(", ");
  }

  // Keys this specific building can create from scratch (hand-checked
  // catalogue defaults) that it does not already have.
  get creatableKeys(): string[] {
    const existing = new Set(
      (this.blueprintItem.buildingData ?? []).map((entry) => entry.Key),
    );
    return creatableSettingsKeysFor(this.blueprintItem.id).filter(
      (key) => !existing.has(key),
    );
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
      value = num / displayScale(row.unit);
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
