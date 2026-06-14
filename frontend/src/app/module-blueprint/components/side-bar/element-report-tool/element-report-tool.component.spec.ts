import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { CameraService } from "../../../../../../../lib/index";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { AddMassUnitPipe } from "src/app/module-blueprint/pipes/add-mass-unit.pipe";
import { FilterElementGasPipe } from "src/app/module-blueprint/pipes/filter-element-gas.pipe";
import { FilterElementLiquidPipe } from "src/app/module-blueprint/pipes/filter-element-liquid.pipe";
import { FilterElementSolidPipe } from "src/app/module-blueprint/pipes/filter-element-solid.pipe";
import { ElementReportToolComponent } from "./element-report-tool.component";

describe("ElementReportToolComponent", () => {
  let component: ElementReportToolComponent;
  let fixture: ComponentFixture<ElementReportToolComponent>;

  beforeEach(async () => {
    // The constructor reads the CameraService singleton.
    new CameraService(null);

    await TestBed.configureTestingModule({
      // The pipes the template uses must be declared even under
      // NO_ERRORS_SCHEMA (schemas don't cover pipes).
      declarations: [
        ElementReportToolComponent,
        AddMassUnitPipe,
        FilterElementGasPipe,
        FilterElementLiquidPipe,
        FilterElementSolidPipe,
      ],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ToolService, useValue: { elementReport: { data: [] } } },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementReportToolComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
