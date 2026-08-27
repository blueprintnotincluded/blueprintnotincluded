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
export declare const CREATABLE_SETTINGS: Record<string, Record<string, Record<string, any>>>;
export declare function creatableSettingsKeysFor(prefabId: string): string[];
export declare function getCreatableSettingDefaults(prefabId: string, key: string): Record<string, any> | undefined;
//# sourceMappingURL=settings-catalog.d.ts.map