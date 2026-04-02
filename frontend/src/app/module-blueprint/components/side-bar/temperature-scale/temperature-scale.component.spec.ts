import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

import { TemperatureScaleComponent } from "./temperature-scale.component";

xdescribe("TemperatureScaleComponent", () => {
  let component: TemperatureScaleComponent;
  let fixture: ComponentFixture<TemperatureScaleComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [TemperatureScaleComponent],
      imports: [],
      providers: [provideHttpClient(withInterceptorsFromDi())],
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
