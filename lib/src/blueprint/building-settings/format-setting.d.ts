import { BniBuildingData } from '../../io/bni/bni-building';
export interface FormattedSettingRow {
    field: string;
    label: string;
    text: string;
}
export declare function formatBuildingDataEntry(entry: BniBuildingData, prefabId?: string): FormattedSettingRow[] | null;
//# sourceMappingURL=format-setting.d.ts.map