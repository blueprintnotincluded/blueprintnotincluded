import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { CommonModule } from "@angular/common";

import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import {
  BlueprintItem,
  getCreatableSettingDefaults,
} from "../../../../../../../lib/index";
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
      // Uses the real catalogue defaults, so a test that clicks the add
      // button sees the object the editor would actually write.
      addBuildingSetting: vi.fn(function (this: any, key: string) {
        const defaults = getCreatableSettingDefaults(this.id, key);
        if (defaults == null) return false;
        this.buildingData = [
          ...(this.buildingData ?? []),
          { Key: key, Value: { ...defaults } },
        ];
        return true;
      }),
      removeBuildingSetting: vi.fn(function (this: any, key: string) {
        const before = this.buildingData?.length ?? 0;
        this.buildingData = (this.buildingData ?? []).filter(
          (e: any) => e.Key != key,
        );
        return this.buildingData.length != before;
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

  it("renders no editable row for a null Value, without crashing (CodeRabbit #212)", () => {
    // A hand-edited file or a mod version we don't know about could leave a
    // known Key with a null/malformed Value. rows() must skip it rather than
    // render a blank editable control backed by nothing.
    setItem("SomeBuilding", [{ Key: "Switch", Value: null as any }]);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.querySelector("fieldset")).toBeNull();
    expect(component.blueprintItem.setBuildingSetting).not.toHaveBeenCalled();
  });

  it("caps a string field at the catalogue's max length, in the template and the handler", () => {
    setItem("LogicAlarm", [
      {
        Key: "LogicAlarm",
        Value: {
          notificationName: "short",
          notificationTooltip: "t",
          notificationType: 0,
          pauseOnNotify: false,
          zoomOnNotify: false,
          cooldown: 1,
        },
      },
    ]);

    const nameInput = fixture.nativeElement.querySelector(
      "input[type=text]",
    ) as HTMLInputElement;
    // notificationName's catalogue max is 200.
    expect(nameInput.maxLength).toBe(200);

    // A programmatic value (e.g. a paste) can still exceed maxlength; the
    // handler must clamp it before it reaches setBuildingSetting.
    nameInput.value = "x".repeat(250);
    nameInput.dispatchEvent(new Event("blur"));

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "LogicAlarm",
      "notificationName",
      "x".repeat(200),
    );
  });

  // --- Threshold sensors -------------------------------------------------
  // IThresholdSwitch stores the raw sim value; the panel has to show what the
  // game's own side screen showed the player, and convert back on edit.

  function numberInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      ".building-setting-number",
    ) as HTMLInputElement;
  }

  it("shows an Atmo Sensor threshold in grams, not stored kilograms", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    expect(numberInput().value).toBe("500");
    expect(
      fixture.nativeElement.querySelector(".building-setting-unit").textContent,
    ).toBe("g");
    // Direction row comes first, so the threshold label is the second one.
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll(".building-setting-label"),
      ).map((e: any) => e.textContent.trim()),
    ).toEqual(["Active", "Pressure"]);
  });

  it("stores an edited gas pressure back in kilograms", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    input.value = "1500";
    input.dispatchEvent(new Event("blur"));

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
      "Threshold",
      1.5,
    );
    expect(emitBlueprintChanged).toHaveBeenCalled();
  });

  it("shows a Thermo Sensor threshold in Celsius and stores Kelvin", () => {
    setItem("LogicTemperatureSensor", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 293.15, ActivateAboveThreshold: false },
      },
    ]);

    expect(numberInput().value).toBe("20");
    expect(
      fixture.nativeElement.querySelector(".building-setting-unit").textContent,
    ).toBe("°C");

    const input = numberInput();
    input.value = "-10";
    input.dispatchEvent(new Event("blur"));

    const call = (component.blueprintItem.setBuildingSetting as any).mock
      .calls[0];
    expect(call[0]).toBe("IThresholdSwitch");
    expect(call[1]).toBe("Threshold");
    expect(call[2]).toBeCloseTo(263.15, 9);
  });

  it("does not write when an input is blurred without being edited", () => {
    // The displayed value is rounded, so re-deriving a stored value from it
    // would nudge 293.153 K to 293.15 and detach rawSource for nothing.
    setItem("LogicTemperatureSensor", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 293.153, ActivateAboveThreshold: true },
      },
    ]);

    numberInput().dispatchEvent(new Event("blur"));

    expect(component.blueprintItem.setBuildingSetting).not.toHaveBeenCalled();
    expect(emitBlueprintChanged).not.toHaveBeenCalled();
  });

  it("clamps a typed value to the sensor's own soft bounds", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    input.value = "999999";
    input.dispatchEvent(new Event("blur"));

    // 20000 g is the 20 kg RangeMax, converted back to stored units.
    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
      "Threshold",
      20,
    );
  });

  it("hides the stowaway Switch key a copied sensor carries", () => {
    // Sensors extend Switch, so the mod's Switch handler stores the sensor's
    // sampled output. It round-trips, but it is not a setting.
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
      { Key: "Switch", Value: { switchedOn: true } },
    ]);

    // No checkbox at all: ActivateAboveThreshold renders as an above/below
    // toggle, and switchedOn is not rendered.
    expect(
      fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length,
    ).toBe(0);
    expect(component.rows.map((r: any) => `${r.key}.${r.field}`)).toEqual([
      "IThresholdSwitch.ActivateAboveThreshold",
      "IThresholdSwitch.Threshold",
    ]);
    // ...and it is not reported as an unrecognized preserved setting either.
    expect(
      fixture.nativeElement.querySelector(".building-setting-other"),
    ).toBeNull();
  });

  it("shows an unset threshold as Not set, with a control to set it", () => {
    setItem("LogicPressureSensorGas", undefined);

    expect(
      fixture.nativeElement
        .querySelector(".building-setting-label")
        .textContent.replace(/\s+/g, " ")
        .trim(),
    ).toBe("Pressure (Not set)");
    expect(
      fixture.nativeElement.querySelector(".building-setting-unset")
        .textContent,
    ).toBe("(Not set)");
    // No number input and no direction toggle until it is set.
    expect(
      fixture.nativeElement.querySelector(".building-setting-number"),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".building-setting-toggle"),
    ).toBeNull();
    // ...and no second, redundant "add" button offering the same thing.
    expect(
      fixture.nativeElement.querySelector(".building-setting-add"),
    ).toBeNull();
  });

  it("writes the key when the unset threshold is set", () => {
    setItem("LogicPressureSensorGas", undefined);

    (
      fixture.nativeElement.querySelector(
        ".building-setting-set",
      ) as HTMLButtonElement
    ).click();

    expect(component.blueprintItem.addBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
    );
    expect(component.blueprintItem.buildingData).toEqual([
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 1, ActivateAboveThreshold: true },
      },
    ]);
    expect(emitBlueprintChanged).toHaveBeenCalled();

    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".building-setting-unset"),
    ).toBeNull();
    expect(numberInput().value).toBe("1000");
  });

  it("clears a stored threshold back to not set", () => {
    setItem("LogicPressureSensorGas", [
      { Key: "Switch", Value: { switchedOn: true } },
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 1.5, ActivateAboveThreshold: true },
      },
    ]);
    expect(component.canClearThreshold).toBe(true);

    const clear = fixture.nativeElement.querySelector(
      ".building-setting-clear",
    ) as HTMLButtonElement;
    expect(clear.textContent.trim()).toBe("Clear threshold");
    clear.click();

    expect(component.blueprintItem.removeBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
    );
    // The unrelated stowaway key is untouched.
    expect(component.blueprintItem.buildingData).toEqual([
      { Key: "Switch", Value: { switchedOn: true } },
    ]);
    expect(emitBlueprintChanged).toHaveBeenCalled();

    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".building-setting-unset")
        .textContent,
    ).toBe("(Not set)");
  });

  it("offers no clear on a building that is not a threshold sensor", () => {
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

    expect(component.canClearThreshold).toBe(false);
    expect(component.thresholdLabel).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".building-setting-clear"),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".building-setting-set"),
    ).toBeNull();
  });

  it("leaves the critter sensor to the plain catalogue, unchanged", () => {
    // Out of scope for the threshold work: it writes the same values under two
    // keys, and its own key also carries countCritters/countEggs.
    setItem("LogicCritterCountSensor", [
      {
        Key: "LogicCritterCountSensor",
        Value: {
          countThreshold: 3,
          activateOnGreaterThan: true,
          countCritters: true,
          countEggs: false,
        },
      },
    ]);

    expect(component.thresholdLabel).toBeNull();
    expect(component.canClearThreshold).toBe(false);
    expect(component.rows.map((r: any) => `${r.key}.${r.field}`)).toEqual([
      "LogicCritterCountSensor.countThreshold",
      "LogicCritterCountSensor.activateOnGreaterThan",
      "LogicCritterCountSensor.countCritters",
      "LogicCritterCountSensor.countEggs",
    ]);
  });

  it("shows the clamped value back in the input, not what was typed", () => {
    // Stored is already at the 20kg RangeMax, so clamping 999999 lands on the
    // value the row already displays. The commit guard correctly skips the
    // write — but the input must not be left showing 999999 while the model
    // holds 20000.
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 20, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    expect(input.value).toBe("20000");

    input.value = "999999";
    input.dispatchEvent(new Event("blur"));
    fixture.detectChanges();

    expect(component.blueprintItem.setBuildingSetting).not.toHaveBeenCalled();
    expect(numberInput().value).toBe("20000");
  });

  it("does not rewrite a stored value already outside the range on an untouched blur", () => {
    // An imported blueprint's stored Threshold can already sit outside the
    // sensor's soft display bounds. That value must be displayed and
    // preserved untouched — a blur with no edit must not clamp it onto the
    // boundary. This is the exact hole a clamp-before-no-op-check ordering
    // opens: 25 kg (25000 g display) is above the 20000 g RangeMax.
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 25, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    expect(input.value).toBe("25000");

    // No edit — the value round-trips through blur exactly as typed.
    input.value = "25000";
    input.dispatchEvent(new Event("blur"));
    fixture.detectChanges();

    expect(component.blueprintItem.setBuildingSetting).not.toHaveBeenCalled();
    expect(numberInput().value).toBe("25000");
  });

  it("shows the clamped value when clamping does change the stored value", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    input.value = "999999";
    input.dispatchEvent(new Event("blur"));
    fixture.detectChanges();

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
      "Threshold",
      20,
    );
    expect(numberInput().value).toBe("20000");
  });

  it("relaxes step to 'any' when min isn't a step multiple (Thermo Sensor)", () => {
    // displayMin is -273.15 (0 K) with step 1 — a native number input
    // validates (value - min) as a step multiple, so a whole-degree value
    // like 20 would otherwise be marked :invalid and the spinner arrows
    // would walk fractional degrees instead of whole ones.
    setItem("LogicTemperatureSensor", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 293.15, ActivateAboveThreshold: true },
      },
    ]);

    expect(numberInput().getAttribute("step")).toBe("any");
  });

  it("keeps a numeric step when min is already step-aligned (Atmo Sensor)", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 1, ActivateAboveThreshold: true },
      },
    ]);

    expect(numberInput().getAttribute("step")).toBe("1");
  });

  it("clamps a value below the minimum up to the bound", () => {
    setItem("LogicTemperatureSensor", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 293.15, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    input.value = "-500";
    input.dispatchEvent(new Event("blur"));
    fixture.detectChanges();

    // 0 K is the RangeMin, which is -273.15 °C.
    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
      "Threshold",
      0,
    );
    expect(numberInput().value).toBe("-273.15");
  });

  // --- Above/Below direction toggle ---------------------------------------

  function toggleOptions(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(".building-setting-toggle-option"),
    );
  }

  it("renders the above/below direction as two options, not a checkbox", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    const options = toggleOptions();
    expect(options.map((b) => b.textContent.trim())).toEqual([
      "Above",
      "Below",
    ]);
    expect(options[0].classList.contains("selected")).toBe(true);
    expect(options[1].classList.contains("selected")).toBe(false);
    expect(
      fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length,
    ).toBe(0);

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(".building-setting-label"),
    ).map((e: any) => e.textContent.trim());
    expect(labels).toContain("Active");
  });

  it("marks Below as selected when the stored direction is false", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: false },
      },
    ]);

    const options = toggleOptions();
    expect(options[0].classList.contains("selected")).toBe(false);
    expect(options[1].classList.contains("selected")).toBe(true);
  });

  it("commits the direction when the other option is picked", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    toggleOptions()[1].click();

    expect(component.blueprintItem.setBuildingSetting).toHaveBeenCalledWith(
      "IThresholdSwitch",
      "ActivateAboveThreshold",
      false,
    );
    expect(emitBlueprintChanged).toHaveBeenCalled();

    fixture.detectChanges();
    expect(toggleOptions()[1].classList.contains("selected")).toBe(true);
  });

  it("does not push an undo step when the selected option is re-picked", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    toggleOptions()[0].click();

    expect(component.blueprintItem.setBuildingSetting).not.toHaveBeenCalled();
    expect(emitBlueprintChanged).not.toHaveBeenCalled();
  });

  it("gives the critter sensor the same above/below control", () => {
    setItem("LogicCritterCountSensor", [
      {
        Key: "LogicCritterCountSensor",
        Value: {
          countThreshold: 3,
          activateOnGreaterThan: false,
          countCritters: true,
          countEggs: false,
        },
      },
    ]);

    const options = toggleOptions();
    expect(options.map((b) => b.textContent.trim())).toEqual([
      "Above",
      "Below",
    ]);
    expect(options[1].classList.contains("selected")).toBe(true);
    // countCritters/countEggs stay ordinary on/off checkboxes.
    expect(
      fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length,
    ).toBe(2);
  });

  it("restores the stored value when a number field is emptied", () => {
    setItem("LogicPressureSensorGas", [
      {
        Key: "IThresholdSwitch",
        Value: { Threshold: 0.5, ActivateAboveThreshold: true },
      },
    ]);

    const input = numberInput();
    input.value = "";
    input.dispatchEvent(new Event("blur"));

    expect(component.blueprintItem.setBuildingSetting).not.toHaveBeenCalled();
    expect(numberInput().value).toBe("500");
  });
});
