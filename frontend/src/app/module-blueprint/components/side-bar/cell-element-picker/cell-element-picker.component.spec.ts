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

// The oreTags checkbox path (build-tool element cells). Solid is opt-in: this
// list exists for gas/liquid annotations, but ticking Solid reaches the natural
// terrain materials — Neutronium above all, the row every geyser sits on.
describe("CellElementPickerComponent solid tag", () => {
  let component: CellElementPickerComponent;
  let fixture: ComponentFixture<CellElementPickerComponent>;

  function tagged(id: string, oreTags: string[]): BuildableElement {
    const element = new BuildableElement();
    element.id = id;
    element.name = id;
    element.oreTags = oreTags;
    return element;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CellElementPickerComponent, ElementIconComponent],
      imports: [FormsModule, CheckboxModule, InputTextModule],
    }).compileComponents();

    BuildableElement.init();
    BuildableElement.load([
      tagged("Oxygen", ["Gas"]),
      tagged("Water", ["Liquid"]),
      tagged("Unobtanium", ["Solid", "Special"]),
      tagged("Granite", ["Solid", "BuildableAny"]),
    ]);

    fixture = TestBed.createComponent(CellElementPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("leaves solids out by default, so the existing list is unchanged", () => {
    const ids = component.elements.map((e) => e.id);
    expect(ids).toContain("Oxygen");
    expect(ids).toContain("Water");
    expect(ids).not.toContain("Unobtanium");
    expect(ids).not.toContain("Granite");
  });

  it("reaches Neutronium once Solid is ticked", () => {
    component.selectedTags = ["Gas", "Liquid", "Solid"];
    component.tagChanged(null);

    const ids = component.elements.map((e) => e.id);
    expect(ids).toContain("Unobtanium");
    expect(ids).toContain("Granite");
    expect(ids).toContain("Oxygen");
  });

  it("can show solids alone", () => {
    component.selectedTags = ["Solid"];
    component.tagChanged(null);

    const ids = component.elements.map((e) => e.id);
    expect(ids).toContain("Unobtanium");
    expect(ids).not.toContain("Oxygen");
    expect(ids).not.toContain("Water");
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
    expect(ids).to.deep.equal(["Granite", "Oxygen", "Water"]);
  });

  it("sorts the state-filtered pool by name (database order is unscannable)", () => {
    // Fixture order is Granite, Water, Oxygen.
    expect(component.elements.map((e) => e.id)).to.deep.equal([
      "Granite",
      "Oxygen",
      "Water",
    ]);
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
      "Oxygen",
      "Water",
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
