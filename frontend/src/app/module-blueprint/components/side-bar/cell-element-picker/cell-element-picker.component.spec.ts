import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { CheckboxModule } from "primeng/checkbox";
import { InputTextModule } from "primeng/inputtext";

import { BuildableElement, ElementState } from "../../../../../../../lib/index";
import { ElementIconComponent } from "../element-icon/element-icon.component";
import { CellElementPickerComponent } from "./cell-element-picker.component";

describe("CellElementPickerComponent", () => {
  let component: CellElementPickerComponent;
  let fixture: ComponentFixture<CellElementPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CellElementPickerComponent, ElementIconComponent],
      imports: [FormsModule, CheckboxModule, InputTextModule],
    }).compileComponents();
  });

  beforeEach(() => {
    BuildableElement.init();
    BuildableElement.load([]);
    fixture = TestBed.createComponent(CellElementPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});

// The element-note picker's state filter (spec/element-notes.md §8.1): a
// fixed `states` pool drives an All/<state>... segmented filter on
// element.state instead of the oreTags Gas/Liquid checkboxes, and always
// excludes None.
describe("CellElementPickerComponent state filter", () => {
  let component: CellElementPickerComponent;
  let fixture: ComponentFixture<CellElementPickerComponent>;

  function elementFixture(id: string, state: ElementState): BuildableElement {
    const element = new BuildableElement();
    element.id = id;
    element.name = id;
    element.state = state;
    return element;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CellElementPickerComponent, ElementIconComponent],
      imports: [FormsModule, CheckboxModule, InputTextModule],
    }).compileComponents();

    BuildableElement.init();
    BuildableElement.elements = [
      elementFixture("Granite", ElementState.Solid),
      elementFixture("Water", ElementState.Liquid),
      elementFixture("Oxygen", ElementState.Gas),
      elementFixture("Vacuum", ElementState.Vacuum),
    ];
    BuildableElement.elements.push(
      Object.assign(new BuildableElement(), { id: "None", name: "None" }),
    );

    fixture = TestBed.createComponent(CellElementPickerComponent);
    component = fixture.componentInstance;
    component.states = [
      ElementState.Solid,
      ElementState.Liquid,
      ElementState.Gas,
    ];
    fixture.detectChanges();
  });

  it("excludes None and Vacuum, keeping only elements in the states pool", () => {
    const ids = component.elements.map((e) => e.id);
    expect(ids).to.deep.equal(["Granite", "Water", "Oxygen"]);
  });

  it("segments down to a single state on selectState", () => {
    component.selectState(ElementState.Liquid);
    expect(component.elements.map((e) => e.id)).to.deep.equal(["Water"]);
  });

  it("selectState(null) returns to the full pool", () => {
    component.selectState(ElementState.Gas);
    component.selectState(null);
    expect(component.elements.map((e) => e.id)).to.deep.equal([
      "Granite",
      "Water",
      "Oxygen",
    ]);
  });

  it("does not affect the tag-based checkbox path for existing callers", () => {
    const forced = TestBed.createComponent(CellElementPickerComponent);
    forced.componentInstance.selectedTags = ["Gas"];
    // Untouched BuildableElement.elements from this describe block have no
    // oreTags set, so the existing tag path (isStateFiltered === false)
    // legitimately returns nothing but None — proving it wasn't switched
    // onto the new state-based filter.
    forced.detectChanges();
    expect(forced.componentInstance.isStateFiltered).to.equal(false);
    expect(forced.componentInstance.elements.map((e) => e.id)).to.deep.equal([
      "None",
    ]);
  });
});
