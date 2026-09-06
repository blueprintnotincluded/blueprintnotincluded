export interface ThresholdSensorSpec {
    label: string;
    unitSuffix: string;
    displayScale: number;
    displayOffset: number;
    storedMin: number;
    storedMax: number;
    step: number;
    decimals: number;
    defaultThreshold: number;
    defaultActivateAbove: boolean;
}
export declare const THRESHOLD_SENSORS: Record<string, ThresholdSensorSpec>;
export declare function thresholdSensorSpec(prefabId: string): ThresholdSensorSpec | undefined;
//# sourceMappingURL=threshold-sensors.d.ts.map