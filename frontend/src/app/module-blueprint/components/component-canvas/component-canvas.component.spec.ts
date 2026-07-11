import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";

import { BuildTool } from "src/app/module-blueprint/common/tools/build-tool";
import { ElementReport } from "src/app/module-blueprint/common/tools/element-report";
import { ComponentCanvasComponent } from "./component-canvas.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { SelectTool } from "src/app/module-blueprint/common/tools/select-tool";
import { ScissorsTool } from "src/app/module-blueprint/common/tools/scissors-tool";
import { DrawPixi } from "src/app/module-blueprint/drawing/draw-pixi";

// The real DrawPixi constructs a PIXI.Application (WebGL) in Init(), which jsdom
// cannot provide. Inject a mock so the renderer never boots in the unit test.
function mockDrawPixi(): Partial<DrawPixi> {
  return {
    getNewContainer: () => ({} as any),
    Init: () => {},
    InitAnimation: () => {},
    blueprintContainer: {} as any,
  };
}

describe("ComponentCanvasComponent", () => {
  let component: ComponentCanvasComponent;
  let fixture: ComponentFixture<ComponentCanvasComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ComponentCanvasComponent],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        BuildTool,
        ElementReport,
        SelectTool,
        ScissorsTool,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    });
    TestBed.overrideComponent(ComponentCanvasComponent, {
      set: { providers: [{ provide: DrawPixi, useFactory: mockDrawPixi }] },
    });

    fixture = TestBed.createComponent(ComponentCanvasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
