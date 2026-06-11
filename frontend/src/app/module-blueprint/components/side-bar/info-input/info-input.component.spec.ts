import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { ColorPickerModule } from "primeng/colorpicker";
import { InputTextModule } from "primeng/inputtext";
import { PopoverModule } from "primeng/popover";

import { BlueprintItemInfo } from "../../../../../../../lib/src/blueprint/blueprint-item-info";
import { InfoInputIconComponent } from "../info-input-icon/info-input-icon.component";
import { InfoInputComponent } from "./info-input.component";

describe("InfoInputComponent", () => {
  let component: InfoInputComponent;
  let fixture: ComponentFixture<InfoInputComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [InfoInputComponent, InfoInputIconComponent],
      imports: [FormsModule, ColorPickerModule, InputTextModule, PopoverModule],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(InfoInputComponent);
    component = fixture.componentInstance;
    component.blueprintIteminfo = {
      infoString: "",
      title: "",
      htmlFrontColor: "#ffffff",
      htmlBackColor: "#007ad9",
      htmlSvgPath: "",
    } as unknown as BlueprintItemInfo;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
