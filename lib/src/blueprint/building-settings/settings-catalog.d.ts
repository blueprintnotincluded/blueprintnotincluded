export type SettingUnit = 's' | 'cycleFraction' | 'bit' | '%';
export type SettingFieldType = 'bool' | 'float' | 'int' | 'string' | 'enum' | 'element' | 'tagSet';
export interface SettingFieldDescriptor {
    field: string;
    labelKey: string;
    type: SettingFieldType;
    unit?: SettingUnit;
    min?: number;
    max?: number;
    enumLabels?: Record<number, string>;
    hidden?: boolean;
    displayScale?: number;
    displayOffset?: number;
    unitSuffix?: string;
    decimals?: number;
    step?: number;
    booleanLabels?: {
        whenTrue: string;
        whenFalse: string;
    };
    elementForceTag?: string;
}
export declare const CRITTER_COUNT_SENSOR_ID = "LogicCritterCountSensor";
export declare const NONE_TAG = "Void";
export declare const FILTERABLE_BUILDINGS: Record<string, string>;
export declare function filterableBuildingForceTag(prefabId: string): string | undefined;
export declare const SETTINGS_CATALOG: Record<string, SettingFieldDescriptor[]>;
export interface SettingTag {
    Name: string;
    IsValid: boolean;
}
export declare function decodeTagSet(raw: unknown): SettingTag[];
export declare function encodeTagSet(tags: readonly SettingTag[]): string;
export declare function isKnownSettingsKey(key: string): boolean;
export declare function toDisplayValue(descriptor: SettingFieldDescriptor, stored: number): number;
export declare function toStoredValue(descriptor: SettingFieldDescriptor, display: number): number;
export declare function resolveSettingDescriptors(prefabId: string, key: string): SettingFieldDescriptor[];
export declare const CREATABLE_SETTINGS: Record<string, Record<string, Record<string, any>>>;
export declare function creatableSettingsKeysFor(prefabId: string): string[];
export declare function getCreatableSettingDefaults(prefabId: string, key: string): Record<string, any> | undefined;
export declare function primarySettingsKey(prefabId: string): {
    key: string;
    label: string;
} | null;
export declare function redundantEchoField(prefabId: string, key: string, field: string): {
    key: string;
    field: string;
} | null;
export declare function redundantEchoKeysFor(prefabId: string, key: string): string[];
//# sourceMappingURL=settings-catalog.d.ts.map