import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { SliderModule } from "primeng/slider";

import {
  BlueprintItem,
  BThresholdSwitchSideScreen,
} from "../../../../../../../../lib/index";
import { ThresholdSwhitchScreenComponent } from "./threshold-switch-screen.component";

describe("ThresholdSwhitchScreenComponent", () => {
  let component: ThresholdSwhitchScreenComponent;
  let fixture: ComponentFixture<ThresholdSwhitchScreenComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ThresholdSwhitchScreenComponent],
      imports: [FormsModule, ButtonModule, SliderModule],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ThresholdSwhitchScreenComponent);
    component = fixture.componentInstance;
    component.thresholdSwitchSideScreen = {
      id: "threshold",
      title: "Threshold",
      thresholdValueUnits: "g",
      rangeMin: 0,
      rangeMax: 100,
      incrementScale: 1,
      aboveToolTip: "Above {0}",
      belowToolTip: "Below {0}",
    } as unknown as BThresholdSwitchSideScreen;
    component.blueprintItem = {
      id: "TestBuilding",
      getUiSettings: () => ({ values: [50, true] }),
    } as unknown as BlueprintItem;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
