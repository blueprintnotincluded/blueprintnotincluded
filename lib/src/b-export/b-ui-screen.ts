import { StringHelpers } from '../string-helpers';

export class BUiScreen {
  id: string;
  inputs: string[];

  constructor(id: string) {
    this.id = id;
    this.inputs = [];
  }

  getDefaultValue(index: number): any {
    return null;
  }

  importFrom(original: BUiScreen) {
    this.inputs = [];
    for (let value of original.inputs) this.inputs.push(value);
  }

  static clone(original: BUiScreen): BUiScreen {
    if (original.id == 'SingleSliderSideScreen') {
      let returnValue = new BSingleSliderSideScreen(original.id);
      returnValue.importFrom(original as BSingleSliderSideScreen);
      return returnValue;
    } else if (original.id == 'ThresholdSwitchSideScreen') {
      let returnValue = new BThresholdSwitchSideScreen(original.id);
      returnValue.importFrom(original as BThresholdSwitchSideScreen);
      return returnValue;
    } else if (original.id == 'ActiveRangeSideScreen') {
      let returnValue = new BActiveRangeSideScreen(original.id);
      returnValue.importFrom(original as BActiveRangeSideScreen);
      return returnValue;
    } else if (original.id == 'LogicBitSelectorSideScreen') {
      let returnValue = new BBitSelectorSideScreen(original.id);
      returnValue.importFrom(original as BBitSelectorSideScreen);
      return returnValue;
    }

    throw new Error('BUiScreen.clone : Unkown UI screen');
  }
}

export class UiSaveSettings {
  id: string;
  values: any[];

  constructor(id: string) {
    this.id = id;
    this.values = [];
  }

  public importFrom(original: UiSaveSettings) {
    for (let value of original.values) this.values.push(value);
  }

  public static clone(original: UiSaveSettings): UiSaveSettings {
    let returnValue = new UiSaveSettings(original.id);
    returnValue.importFrom(original);
    return returnValue;
  }
}

export class BSingleSliderSideScreen extends BUiScreen {
  public title: string = '';
  public sliderUnits: string = '';
  public min: number = 0;
  public max: number = 0;
  public tooltip: string = '';
  public sliderDecimalPlaces: number = 0;
  public defaultValue: number = 0;

  constructor(id: string) {
    super(id);
  }

  getDefaultValue(index: number): any {
    if (index == 0) return this.defaultValue;
    else return null;
  }

  importFrom(original: BSingleSliderSideScreen) {
    super.importFrom(original);
    this.title = original.title;
    this.sliderUnits = original.sliderUnits;
    this.min = original.min;
    this.max = original.max;
    this.tooltip = StringHelpers.stripHtml(original.tooltip);
    this.sliderDecimalPlaces = original.sliderDecimalPlaces;
    this.defaultValue = original.defaultValue;
  }
}

export class BThresholdSwitchSideScreen extends BUiScreen {
  public title: string = '';
  public aboveToolTip: string = '';
  public belowToolTip: string = '';
  public thresholdValueName: string = '';
  public thresholdValueUnits: string = '';
  public rangeMin: number = 0;
  public rangeMax: number = 0;
  public incrementScale: number = 0;
  public defaultValue: number = 0;
  public defaultBoolean: boolean = false;

  constructor(id: string) {
    super(id);
  }

  getDefaultValue(index: number): any {
    if (index == 0) return this.defaultValue;
    else if (index == 1) return this.defaultBoolean;
    else return null;
  }

  importFrom(original: BThresholdSwitchSideScreen) {
    super.importFrom(original);
    this.title = original.title;
    this.aboveToolTip = StringHelpers.stripHtml(original.aboveToolTip);
    this.belowToolTip = StringHelpers.stripHtml(original.belowToolTip);
    this.thresholdValueName = original.thresholdValueName;
    this.thresholdValueUnits = original.thresholdValueUnits;
    this.rangeMin = original.rangeMin;
    this.rangeMax = original.rangeMax;
    this.incrementScale = original.incrementScale;
    this.defaultValue = original.defaultValue;
    this.defaultBoolean = original.defaultBoolean;
  }
}

export class BActiveRangeSideScreen extends BUiScreen {
  public title: string = '';
  public minValue: number = 0;
  public maxValue: number = 0;
  public defaultActivateValue: number = 0;
  public defaultDeactivateValue: number = 0;
  public activateSliderLabelText: string = '';
  public deactivateSliderLabelText: string = '';
  public activateTooltip: string = '';
  public deactivateTooltip: string = '';

  constructor(id: string) {
    super(id);
  }

  getDefaultValue(index: number): any {
    if (index == 0) return this.minValue;
    else if (index == 1) return this.maxValue;
    else return null;
  }

  importFrom(original: BActiveRangeSideScreen) {
    super.importFrom(original);
    this.title = original.title;
    this.activateTooltip = StringHelpers.stripHtml(original.activateTooltip);
    this.deactivateTooltip = StringHelpers.stripHtml(original.deactivateTooltip);
    this.minValue = original.minValue;
    this.maxValue = original.maxValue;
  }
}

export class BBitSelectorSideScreen extends BUiScreen {
  public title: string = '';
  public description: string = '';

  constructor(id: string) {
    super(id);
  }

  getDefaultValue(index: number): any {
    if (index == 0) return 0;
    else return null;
  }

  importFrom(original: BBitSelectorSideScreen) {
    super.importFrom(original);
    this.title = original.title;
    this.description = original.description;
  }
}
