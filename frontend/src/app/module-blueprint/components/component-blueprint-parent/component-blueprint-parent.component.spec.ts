import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { of } from "rxjs";

import { DatePipe } from "@angular/common";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BuildTool } from "src/app/module-blueprint/common/tools/build-tool";
import { ComponentBlueprintParentComponent } from "./component-blueprint-parent.component";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { ElementReport } from "src/app/module-blueprint/common/tools/element-report";
import { SelectTool } from "src/app/module-blueprint/common/tools/select-tool";

describe("ComponentBlueprintParentComponent", () => {
  let component: ComponentBlueprintParentComponent;
  let fixture: ComponentFixture<ComponentBlueprintParentComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ComponentBlueprintParentComponent],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of([{ width: 200, height: 100 }]),
          },
        },
        AuthenticationService,
        BuildTool,
        DatePipe,
        ElementReport,
        SelectTool,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentBlueprintParentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should unsubscribe from blueprintService on destroy", () => {
    const blueprintService = TestBed.inject(BlueprintService);
    const observersBefore = blueprintService.observersBlueprintChanged.length;
    fixture.destroy();
    expect(blueprintService.observersBlueprintChanged.length).toBe(
      observersBefore - 1
    );
  });
});
