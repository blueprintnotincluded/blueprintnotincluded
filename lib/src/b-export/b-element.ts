import { StringHelpers } from '../string-helpers';

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

  color: number = 0;
  conduitColor: number = 0;
  uiColor: number = 0;

  // Generated
  iconUrl: string = '';

  public importFrom(original: BuildableElement) {
    this.id = original.id;
    this.name = original.name;
    this.tag = original.tag;

    this.oreTags = [];
    if (original.oreTags != null) for (let s of original.oreTags) this.oreTags.push(s);

    this.icon = original.icon;
    this.iconUrl = StringHelpers.createUrl(this.icon, true);

    this.buildMenuSort = original.buildMenuSort;

    this.color = original.color;
    this.conduitColor = original.conduitColor;
    this.uiColor = original.uiColor;
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

  // Get a list of elements that have the parameter tag
  public static getElementsFromTag(tag: string): BuildableElement[] {
    let returnValue: BuildableElement[] = [];

    for (let element of BuildableElement.elements)
      if (
        returnValue.indexOf(element) == -1 &&
        (element.id == tag || element.oreTags.indexOf(tag) != -1) &&
        element.oreTags.indexOf('BuildableAny') != -1
      )
        returnValue.push(element);

    if (returnValue.length == 0) returnValue.push(BuildableElement.getElement('Unobtanium'));

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
