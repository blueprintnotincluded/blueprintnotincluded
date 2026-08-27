import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { CommonModule } from "@angular/common";

import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { BlueprintItem } from "../../../../../../../lib/index";
import { BuildingSettingsComponent } from "./building-settings.component";

describe("BuildingSettingsComponent", () => {
  let component: BuildingSettingsComponent;
  let fixture: ComponentFixture<BuildingSettingsComponent>;
  let emitBlueprintChanged: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    emitBlueprintChanged = vi.fn();

    await TestBed.configureTestingModule({
      declarations: [BuildingSettingsComponent],
      imports: [CommonModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: BlueprintService,
          useValue: { blueprint: { emitBlueprintChanged } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BuildingSettingsComponent);
    component = fixture.componentInstance;
  });

  function makeItem(id: string, buildingData: BlueprintItem["buildingData"]) {
    return {
      id,
      buildingData,
      setBuildingSetting: vi.fn(function (
        this: any,
        key: string,
        field: string,
        value: unknown,
      ) {
        const entry = this.buildingData.find((e: any) => e.Key == key);
        entry.Value[field] = value;
      }),
      addBuildingSetting: vi.fn(function (this: any, key: string) {
        this.buildingData = [
          ...(this.buildingData ?? []),
          { Key: key, Value: { onDuration: 10, offDuration: 10 } },
        ];
        return true;
      }),
    } as unknown as BlueprintItem;
  }

  function setItem(id: string, buildingData: BlueprintItem["buildingData"]) {
    component.blueprintItem = makeItem(id, buildingData);
    fixture.detectChanges();
  }

  it("renders nothing for a building with no settings and no creatable keys", () => {
    setItem("TestBuilding", undefined);
    expect(fixture.nativeElement.querySelector("fieldset")).toBeNull();
  });

  it("renders editable rows for known keys, matching the Time Sensors fixture shape", () => {
    setItem("LogicTimerSensor", [
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

    const numberInputs = fixture.nativeElement.querySelectorAll(
      "input[type=number]",
    ) as NodeListOf<HTMLInputElement>;
    const values = Array.from(numberInputs).map((i) => i.value);
    expect(values).toContain("5");

    const checkbox = fixture.nativeElement.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // The hidden runtime field never reaches the DOM as an input or label.
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain("3.0999");
    expect(text).not.toContain("Time elapsed");
  });

  it("renders a preserved-count line for a key outside the curated catalogue", () => {
    setItem("Door", [{ Key: "Door", Value: { requestedState: 1 } }]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("1 other stored setting");
    expect(text).not.toContain("requestedState");
  });

  it("mixes known rows and an other-settings count in the same panel", () => {
    setItem("SomeBuilding", [
      { Key: "BuildingEnabledButton", Value: { IsEnabled: true } },
      { Key: "PixelPack", Value: { colorSettings: "{}" } },
      { Key: "AccessControl", Value: { defaultPermissionByTag: "{}" } },
    ]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Enabled");
    expect(text).toContain("2 other stored settings");
  });

  it("commits a number field on blur: setBuildingSetting then emitBlueprintChanged", () => {
    setItem("LogicTimerSensor", [
      {
        Key: "LogicTimerSensor",
        Value: {
          onDuration: 5.0,
          offDuration: 5.0,
          timeElapsedInCurrentState: 0,
          displayCyclesMode: false,
        },
      },
    ]);

    const numberInput = fixture.nativeElement.querySelector(
      "input[type=number]",
    ) as HTMLInputElement;
    numberInput.value = "42";
    numberInput.dispatchEvent(new Event("blur"));

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "LogicTimerSensor",
      "onDuration",
      42,
    );
    expect(emitBlueprintChanged).toHaveBeenCalled();
  });

  it("keeps a typed value across a change-detection cycle mid-edit (trackBy regression)", () => {
    // Reported bug: the editor's global zone.js hooks re-run change
    // detection on every keystroke (the (keydown.enter) binding registers a
    // real keydown listener). Without a stable trackBy, *ngFor's identity
    // diffing tore down and rebuilt the <input> DOM node on every such
    // cycle, discarding whatever had just been typed but not yet committed.
    setItem("LogicTimerSensor", [
      {
        Key: "LogicTimerSensor",
        Value: {
          onDuration: 5.0,
          offDuration: 5.0,
          timeElapsedInCurrentState: 0,
          displayCyclesMode: false,
        },
      },
    ]);

    let numberInput = fixture.nativeElement.querySelector(
      "input[type=number]",
    ) as HTMLInputElement;
    numberInput.value = "42";
    // Simulate an incidental app-wide change-detection tick firing while the
    // field still holds an uncommitted keystroke.
    fixture.detectChanges();
    // Re-query rather than reuse the captured reference: a torn-down/rebuilt
    // node would leave `numberInput` pointing at a detached element, masking
    // the bug from a naive assertion on the stale reference.
    numberInput = fixture.nativeElement.querySelector(
      "input[type=number]",
    ) as HTMLInputElement;
    expect(numberInput.value).toBe("42");
  });

  it("clamps a number field to the catalogue's soft bounds on commit", () => {
    setItem("LogicRibbonReader", [
      { Key: "LogicRibbonReader", Value: { selectedBit: 1 } },
    ]);

    const numberInput = fixture.nativeElement.querySelector(
      "input[type=number]",
    ) as HTMLInputElement;
    numberInput.value = "99";
    numberInput.dispatchEvent(new Event("blur"));

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "LogicRibbonReader",
      "selectedBit",
      3,
    );
  });

  it("commits a checkbox field immediately on change", () => {
    setItem("LogicTimerSensor", [
      { Key: "Switch", Value: { switchedOn: true } },
    ]);

    const checkbox = fixture.nativeElement.querySelector(
      "input[type=checkbox]",
    ) as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "Switch",
      "switchedOn",
      false,
    );
    expect(emitBlueprintChanged).toHaveBeenCalled();
  });

  it("offers to add automation settings on a building with no data yet, and commits on click", () => {
    setItem("LogicTimerSensor", undefined);

    const addButton = fixture.nativeElement.querySelector(
      ".building-setting-add",
    ) as HTMLButtonElement;
    expect(addButton).not.toBeNull();

    addButton.click();

    expect(component.blueprintItem.addBuildingSetting).toHaveBeenCalledWith(
      "LogicTimerSensor",
    );
    expect(emitBlueprintChanged).toHaveBeenCalled();
  });

  it("does not offer to add settings for a building with no creatable keys", () => {
    setItem("Door", [{ Key: "Door", Value: { requestedState: 1 } }]);
    expect(
      fixture.nativeElement.querySelector(".building-setting-add"),
    ).toBeNull();
  });
});
