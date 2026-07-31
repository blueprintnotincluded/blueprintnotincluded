import { ElementState } from '../enums/element-state';

// Neutronium's element id in the game's data. The indestructible material every
// geyser, vent and volcano is anchored on, which is why the editor seeds a row
// of it under a placed terrain feature. Not buildable by dupes, so it never
// appears in the build menu and the game never shows its (placeholder magenta)
// uiColor — see BlueprintItemElement's solid branch.
export const NEUTRONIUM_ELEMENT_ID = 'Unobtanium';

// Display tint for Neutronium, wherever it is drawn — element cells and the
// element-note badges the terrain tool seeds under a feature.
//
// A presentational override, and the only one: Neutronium is the one element
// whose exported colours are sentinels rather than real values — `color` is
// pure white and `uiColor` a placeholder magenta — because the game never
// renders it as a material or shows it in any material UI. Taking either at
// face value paints the brightest thing on the canvas underneath every geyser.
// This is the near-black the game's own tile reads as; the database keeps the
// export's values untouched.
export const NEUTRONIUM_DISPLAY_COLOR = 0x0e0e0e;

// Elements that buildings can be made of (Exported from the game)
// TODO we don't currently handle "exotic" elements (ie reed fibers for paintings, or bleach stone for sanitation stations)
export class BuildableElement {
  // From export
  id: string = '';
  name: string = '';
  tag: number = 0;
  oreTags: string[] = [];
  icon: string = '';
  buildMenuSort: number = 0;
  state: ElementState = ElementState.Vacuum;

  color: number = 0;
  conduitColor: number = 0;
  uiColor: number = 0;

  // The game's own load-time defaults, used to seed mass/temperature pickers per
  // element rather than applying one hardcoded constant to all of them. Masses are
  // kg; temperatures are Kelvin (convert for display only).
  maxMass: number = 0;
  defaultMass: number = 0;
  defaultTemperature: number = 0;
  lowTemp: number = 0;
  highTemp: number = 0;

  // Generated
  iconUrl: string = '';

  public importFrom(original: BuildableElement) {
    this.id = original.id;
    this.name = original.name;
    this.tag = original.tag;

    this.oreTags = [];
    if (original.oreTags != null) for (let s of original.oreTags) this.oreTags.push(s);

    this.icon = original.icon;
    this.iconUrl = this.icon ? 'assets/ui_image/' + this.icon + '.png' : '';

    this.buildMenuSort = original.buildMenuSort;
    this.state = original.state ?? ElementState.Vacuum;

    this.color = original.color;
    this.conduitColor = original.conduitColor;
    this.uiColor = original.uiColor;

    // Databases predating the element-defaults export carry none of these; fall
    // back to 0 rather than NaN so a stale DB degrades to "no range" instead of
    // poisoning every slider bound that reads them.
    this.maxMass = original.maxMass ?? 0;
    this.defaultMass = original.defaultMass ?? 0;
    this.defaultTemperature = original.defaultTemperature ?? 0;
    this.lowTemp = original.lowTemp ?? 0;
    this.highTemp = original.highTemp ?? 0;
  }

  public get isGas(): boolean {
    return this.state === ElementState.Gas;
  }

  public get isLiquid(): boolean {
    return this.state === ElementState.Liquid;
  }

  public get isSolid(): boolean {
    return this.state === ElementState.Solid;
  }

  public hasTag(tag: string) {
    return this.oreTags.indexOf(tag) != -1;
  }

  // static
  public static elements: BuildableElement[];
  public static init() {
    BuildableElement.elements = [];
  }

  public static load(originals: BuildableElement[]) {
    for (let original of originals) {
      let newElement = new BuildableElement();
      newElement.importFrom(original);

      BuildableElement.elements.push(newElement);
    }

    let none = new BuildableElement();
    none.id = 'None';
    none.name = 'None';
    BuildableElement.elements.push(none);
  }

  public static getElement(id: string): BuildableElement {
    for (let element of BuildableElement.elements) if (element.id == id) return element;

    throw new Error('BuildableElement.getElement : Element not found');
  }

  // Resolve a Klei tag hash (BlueprintsV2 selected_elements / element-note id)
  // to an element. Returns undefined for unknown hashes — callers keep the
  // default material rather than failing the import.
  public static getElementByTag(tag: number): BuildableElement | undefined {
    for (let element of BuildableElement.elements) if (element.tag == tag) return element;
    return undefined;
  }

  // Get a list of elements that have the parameter tag
  public static getElementsFromTag(tag: string): BuildableElement[] {
    let returnValue: BuildableElement[] = [];

    // Some game exports include non-buildable cost items (e.g. BuildingFiber/Reed)
    // that should not appear as a selectable construction material in the UI.
    // Treat these as non-selectable by returning an empty list.
    if (tag === 'BuildingFiber') return [];

    // U59 emits union categories as '&'-joined tag lists (e.g. "Plumbable&Metal"
    // on the liquid pipe): an element matching any part is a valid material.
    const tagParts = tag.split('&');

    // Gate on Solid, not BuildableAny: niche materials (WoodLog, Rubber, Snow,
    // Fossil) carry their category tag but not the BuildableAny wildcard, while
    // molten/gas metal phases carry Metal but are not Solid.
    for (let element of BuildableElement.elements)
      if (
        returnValue.indexOf(element) == -1 &&
        tagParts.some((part) => element.id == part || element.oreTags.indexOf(part) != -1) &&
        element.oreTags.indexOf('Solid') != -1
      )
        returnValue.push(element);

    returnValue = returnValue.sort((i1, i2) => {
      return i1.buildMenuSort - i2.buildMenuSort;
    });
    return returnValue;
  }

  // Some buildings are made from more than one element (Steam Turbine)
  public static getElementsFromTags(tags: string[]): BuildableElement[][] {
    let returnValue: BuildableElement[][] = [];

    for (let indexTag = 0; indexTag < tags.length; indexTag++) {
      returnValue[indexTag] = [];
      returnValue[indexTag] = this.getElementsFromTag(tags[indexTag]);
    }

    return returnValue;
  }
}
