import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { CheckboxModule } from "primeng/checkbox";
import { InputTextModule } from "primeng/inputtext";

import { BuildableElement } from "../../../../../../../lib/index";
import { ElementIconComponent } from "../element-icon/element-icon.component";
import { CellElementPickerComponent } from "./cell-element-picker.component";

describe("CellElementPickerComponent", () => {
  let component: CellElementPickerComponent;
  let fixture: ComponentFixture<CellElementPickerComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [CellElementPickerComponent, ElementIconComponent],
      imports: [FormsModule, CheckboxModule, InputTextModule],
    }).compileComponents();
  }));

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
