import { ElementState } from '../enums/element-state';
import { Overlay } from '../enums/overlay';
export declare const NEUTRONIUM_ELEMENT_ID = "Unobtanium";
export declare const NEUTRONIUM_DISPLAY_COLOR = 921102;
export declare class BuildableElement {
    id: string;
    name: string;
    tag: number;
    oreTags: string[];
    icon: string;
    buildMenuSort: number;
    state: ElementState;
    color: number;
    conduitColor: number;
    uiColor: number;
    maxMass: number;
    defaultMass: number;
    defaultTemperature: number;
    lowTemp: number;
    highTemp: number;
    iconUrl: string;
    importFrom(original: BuildableElement): void;
    get isGas(): boolean;
    get isLiquid(): boolean;
    get isSolid(): boolean;
    hasTag(tag: string): boolean;
    static elements: BuildableElement[];
    static init(): void;
    static load(originals: BuildableElement[]): void;
    static getElement(id: string): BuildableElement;
    static getElementByTag(tag: number): BuildableElement | undefined;
    static getElementsFromTag(tag: string): BuildableElement[];
    static getElementsFromTags(tags: string[]): BuildableElement[][];
}
export declare const OVERLAY_DIMMED_ALPHA = 0.3;
export declare function elementOwnOverlay(element: BuildableElement): Overlay | null;
export declare function elementItemOverlay(overlay: Overlay): Overlay;
export declare function isElementOverlayPrimary(element: BuildableElement, overlay: Overlay): boolean;
//# sourceMappingURL=b-element.d.ts.map