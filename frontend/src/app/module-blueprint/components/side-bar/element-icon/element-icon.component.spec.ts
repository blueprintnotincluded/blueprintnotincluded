import { ComponentFixture, TestBed } from "@angular/core/testing";

import { BuildableElement, ElementState } from "../../../../../../../lib/index";
import { ElementIconComponent } from "./element-icon.component";

describe("ElementIconComponent", () => {
  let component: ElementIconComponent;
  let fixture: ComponentFixture<ElementIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ElementIconComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementIconComponent);
    component = fixture.componentInstance;
    const element = new BuildableElement();
    element.id = "None";
    element.name = "None";
    component.element = element;
    component.width = "16px";
    component.height = "16px";
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});

// Solid elements must render their real iconUrl, not the generic liquid/gas
// SVG art — the state field (populated by the #176 element-defaults export)
// is the authoritative discriminator, with hasTag kept only as a fallback
// for a database predating that export (spec/element-notes.md §8.1).
describe("ElementIconComponent state gating", () => {
  function elementWith(
    state: ElementState,
    oreTags: string[],
  ): BuildableElement {
    const element = new BuildableElement();
    element.state = state;
    element.oreTags = oreTags;
    return element;
  }

  it("renders a solid as an icon even if oreTags carry a stale Liquid/Gas tag", () => {
    const component = new ElementIconComponent();
    component.element = elementWith(ElementState.Solid, ["Solid", "Liquid"]);
    expect(component.isLiquid).to.equal(false);
    expect(component.isGas).to.equal(false);
    expect(component.isIcon).to.equal(true);
  });

  it("renders a liquid/gas by state even without the matching oreTag", () => {
    const component = new ElementIconComponent();
    component.element = elementWith(ElementState.Liquid, []);
    expect(component.isLiquid).to.equal(true);
    expect(component.isIcon).to.equal(false);

    component.element = elementWith(ElementState.Gas, []);
    expect(component.isGas).to.equal(true);
    expect(component.isIcon).to.equal(false);
  });

  it("falls back to oreTags when state is unset (Vacuum) — stale database", () => {
    const component = new ElementIconComponent();
    component.element = elementWith(ElementState.Vacuum, ["Liquid"]);
    expect(component.isLiquid).to.equal(true);

    component.element = elementWith(ElementState.Vacuum, ["Gas"]);
    expect(component.isGas).to.equal(true);

    component.element = elementWith(ElementState.Vacuum, []);
    expect(component.isIcon).to.equal(true);
  });
});
