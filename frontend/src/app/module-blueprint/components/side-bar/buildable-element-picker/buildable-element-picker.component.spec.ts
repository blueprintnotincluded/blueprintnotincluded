import { ComponentFixture, TestBed } from "@angular/core/testing";

import { BuildableElementPickerComponent } from "./buildable-element-picker.component";

describe("BuildableElementDropdownComponent", () => {
  let component: BuildableElementPickerComponent;
  let fixture: ComponentFixture<BuildableElementPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BuildableElementPickerComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BuildableElementPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
