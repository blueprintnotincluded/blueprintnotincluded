import { ComponentFixture, TestBed } from "@angular/core/testing";

import { BuildableElement } from "../../../../../../../lib/index";
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
