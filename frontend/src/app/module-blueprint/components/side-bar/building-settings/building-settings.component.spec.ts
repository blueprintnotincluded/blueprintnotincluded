import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { CommonModule } from "@angular/common";

import { BlueprintItem } from "../../../../../../../lib/index";
import { BuildingSettingsComponent } from "./building-settings.component";

describe("BuildingSettingsComponent", () => {
  let component: BuildingSettingsComponent;
  let fixture: ComponentFixture<BuildingSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuildingSettingsComponent],
      imports: [CommonModule],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BuildingSettingsComponent);
    component = fixture.componentInstance;
  });

  function setBuildingData(buildingData: BlueprintItem["buildingData"]) {
    component.blueprintItem = { buildingData } as unknown as BlueprintItem;
    fixture.detectChanges();
  }

  it("renders nothing for a building with no settings", () => {
    setBuildingData(undefined);
    expect(fixture.nativeElement.querySelector("fieldset")).toBeNull();
  });

  it("renders labeled rows for known keys, matching the Time Sensors fixture shape", () => {
    setBuildingData([
      { Key: "Switch", Value: { switchedOn: true } },
      {
        Key: "LogicTimerSensor",
        Value: {
          onDuration: 5.0,
          offDuration: 5.0,
          timeElapsedInCurrentState: 3.099925,
          displayCyclesMode: false,
        },
      },
    ]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("On");
    expect(text).toContain("5 s");
    expect(text).toContain("Off duration");
    // The hidden runtime field never reaches the DOM.
    expect(text).not.toContain("3.0999");
    expect(fixture.nativeElement.querySelector("fieldset")).not.toBeNull();
  });

  it("renders a preserved-count line for a key outside the curated catalogue", () => {
    setBuildingData([{ Key: "Door", Value: { requestedState: 1 } }]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("1 other stored setting");
    expect(text).not.toContain("requestedState");
  });

  it("mixes known rows and an other-settings count in the same panel", () => {
    setBuildingData([
      { Key: "BuildingEnabledButton", Value: { IsEnabled: true } },
      { Key: "PixelPack", Value: { colorSettings: "{}" } },
      { Key: "AccessControl", Value: { defaultPermissionByTag: "{}" } },
    ]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Enabled");
    expect(text).toContain("2 other stored settings");
  });
});
