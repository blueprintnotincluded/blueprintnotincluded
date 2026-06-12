import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { SliderModule } from "primeng/slider";

import {
  BlueprintItem,
  BSingleSliderSideScreen,
} from "../../../../../../../../lib/index";
import { SingleSliderScreenComponent } from "./single-slider-screen.component";

describe("SingleSliderScreenComponent", () => {
  let component: SingleSliderScreenComponent;
  let fixture: ComponentFixture<SingleSliderScreenComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [SingleSliderScreenComponent],
      imports: [FormsModule, SliderModule],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SingleSliderScreenComponent);
    component = fixture.componentInstance;
    component.singleSliderSideScreen = {
      id: "slider",
      title: "Slider",
      sliderUnits: "%",
      min: 0,
      max: 100,
      tooltip: "{0}",
      sliderDecimalPlaces: 0,
    } as unknown as BSingleSliderSideScreen;
    component.blueprintItem = {
      getUiSettings: () => ({ values: [50] }),
    } as unknown as BlueprintItem;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
