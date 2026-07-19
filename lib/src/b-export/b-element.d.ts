export declare class BuildableElement {
    id: string;
    name: string;
    tag: number;
    oreTags: string[];
    icon: string;
    buildMenuSort: number;
    color: number;
    conduitColor: number;
    uiColor: number;
    iconUrl: string;
    importFrom(original: BuildableElement): void;
    hasTag(tag: string): boolean;
    static elements: BuildableElement[];
    static init(): void;
    static load(originals: BuildableElement[]): void;
    static getElement(id: string): BuildableElement;
    static getElementByTag(tag: number): BuildableElement | undefined;
    static getElementsFromTag(tag: string): BuildableElement[];
    static getElementsFromTags(tags: string[]): BuildableElement[][];
}
//# sourceMappingURL=b-element.d.ts.map