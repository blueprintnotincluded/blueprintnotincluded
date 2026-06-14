import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { CheckboxModule } from "primeng/checkbox";
import { PopoverModule } from "primeng/popover";

import { BuildableElement } from "../../../../../../../lib";
import { CellElementPickerComponent } from "../cell-element-picker/cell-element-picker.component";
import { ElementIconComponent } from "../element-icon/element-icon.component";
import { PipeContentComponent } from "./pipe-content.component";

describe("PipeContentComponent", () => {
  let component: PipeContentComponent;
  let fixture: ComponentFixture<PipeContentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        PipeContentComponent,
        ElementIconComponent,
        CellElementPickerComponent,
      ],
      imports: [FormsModule, CheckboxModule, PopoverModule],
    }).compileComponents();
  });

  beforeEach(() => {
    BuildableElement.init();
    BuildableElement.load([]);
    fixture = TestBed.createComponent(PipeContentComponent);
    component = fixture.componentInstance;
    const element = new BuildableElement();
    element.id = "None";
    element.name = "None";
    component.currentElement = element;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
