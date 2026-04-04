export declare class BUiScreen {
    id: string;
    inputs: string[];
    constructor(id: string);
    getDefaultValue(_index: number): any;
    importFrom(original: BUiScreen): void;
    static clone(original: BUiScreen): BUiScreen;
}
export declare class UiSaveSettings {
    id: string;
    values: any[];
    constructor(id: string);
    importFrom(original: UiSaveSettings): void;
    static clone(original: UiSaveSettings): UiSaveSettings;
}
export declare class BSingleSliderSideScreen extends BUiScreen {
    title: string;
    sliderUnits: string;
    min: number;
    max: number;
    tooltip: string;
    sliderDecimalPlaces: number;
    defaultValue: number;
    constructor(id: string);
    getDefaultValue(index: number): any;
    importFrom(original: BSingleSliderSideScreen): void;
}
export declare class BThresholdSwitchSideScreen extends BUiScreen {
    title: string;
    aboveToolTip: string;
    belowToolTip: string;
    thresholdValueName: string;
    thresholdValueUnits: string;
    rangeMin: number;
    rangeMax: number;
    incrementScale: number;
    defaultValue: number;
    defaultBoolean: boolean;
    constructor(id: string);
    getDefaultValue(index: number): any;
    importFrom(original: BThresholdSwitchSideScreen): void;
}
export declare class BActiveRangeSideScreen extends BUiScreen {
    title: string;
    minValue: number;
    maxValue: number;
    defaultActivateValue: number;
    defaultDeactivateValue: number;
    activateSliderLabelText: string;
    deactivateSliderLabelText: string;
    activateTooltip: string;
    deactivateTooltip: string;
    constructor(id: string);
    getDefaultValue(index: number): any;
    importFrom(original: BActiveRangeSideScreen): void;
}
export declare class BBitSelectorSideScreen extends BUiScreen {
    title: string;
    description: string;
    constructor(id: string);
    getDefaultValue(index: number): any;
    importFrom(original: BBitSelectorSideScreen): void;
}
//# sourceMappingURL=b-ui-screen.d.ts.map