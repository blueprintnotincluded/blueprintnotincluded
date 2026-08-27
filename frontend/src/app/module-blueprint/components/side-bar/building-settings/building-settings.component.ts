import { Component, Input } from "@angular/core";
import {
  BlueprintItem,
  formatBuildingDataEntry,
  FormattedSettingRow,
} from "../../../../../../../lib/index";

interface DisplayedSettingRow extends FormattedSettingRow {
  key: string;
}

// Read-only display of a building's BlueprintsV2 buildingData (timer
// durations, switch state, logic gate delays, ...) — spec/building-settings-plan.md
// phase 2. Curated keys render as labeled rows; every other stored Key is
// preserved but shown only as a count, never dumped as raw JSON.
@Component({
  selector: "app-building-settings",
  templateUrl: "./building-settings.component.html",
  styleUrls: ["./building-settings.component.css"],
  standalone: false,
})
export class BuildingSettingsComponent {
  @Input() blueprintItem!: BlueprintItem;

  get hasSettings(): boolean {
    return (this.blueprintItem.buildingData?.length ?? 0) > 0;
  }

  get rows(): DisplayedSettingRow[] {
    const rows: DisplayedSettingRow[] = [];
    for (const entry of this.blueprintItem.buildingData ?? []) {
      const formatted = formatBuildingDataEntry(entry);
      if (formatted == null) continue;
      for (const row of formatted) rows.push({ ...row, key: entry.Key });
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
}
