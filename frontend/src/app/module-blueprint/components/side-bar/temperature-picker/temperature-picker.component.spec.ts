import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { SliderModule } from "primeng/slider";

import { BlueprintItem } from "../../../../../../../lib/index";
import { TemperaturePickerComponent } from "./temperature-picker.component";

describe("TemperaturePickerComponent", () => {
  let component: TemperaturePickerComponent;
  let fixture: ComponentFixture<TemperaturePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TemperaturePickerComponent],
      imports: [FormsModule, SliderModule],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TemperaturePickerComponent);
    component = fixture.componentInstance;
    component.blueprintItem = {
      temperature: 293.15,
      temperatureCelcius: 20,
      temperatureScale: 50,
    } as unknown as BlueprintItem;
    component.temperatureWarning = false;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
