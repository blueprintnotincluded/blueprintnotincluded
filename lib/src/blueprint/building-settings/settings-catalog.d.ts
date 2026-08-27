export type SettingUnit = 's' | 'cycleFraction' | 'bit' | '%';
export type SettingFieldType = 'bool' | 'float' | 'int' | 'string' | 'enum';
export interface SettingFieldDescriptor {
    field: string;
    labelKey: string;
    type: SettingFieldType;
    unit?: SettingUnit;
    min?: number;
    max?: number;
    enumLabels?: Record<number, string>;
    hidden?: boolean;
}
export declare const SETTINGS_CATALOG: Record<string, SettingFieldDescriptor[]>;
export declare function isKnownSettingsKey(key: string): boolean;
//# sourceMappingURL=settings-catalog.d.ts.map