import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";

import { GameStringService } from "../../../services/game-string-service";
import { TemperatureScaleComponent } from "./temperature-scale.component";

describe("TemperatureScaleComponent", () => {
  let component: TemperatureScaleComponent;
  let fixture: ComponentFixture<TemperatureScaleComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [TemperatureScaleComponent],
      providers: [{ provide: GameStringService, useValue: { dict: {} } }],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TemperatureScaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
