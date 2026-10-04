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
import { CameraService, Overlay } from "../../../../../../lib/index";

// The real DrawPixi constructs a PIXI.Application (WebGL) in Init(), which jsdom
// cannot provide. Inject a mock so the renderer never boots in the unit test.
// DrawRoomOverlay/DrawNotesOverlay (created in ngOnInit) need container/
// graphics/text/sprite/texture factories and the stage to attach to — plain
// stubs keep them inert.
function mockDrawPixi(): Partial<DrawPixi> {
  return {
    getNewContainer: () => ({ addChild: () => {}, visible: true }) as any,
    getNewGraphics: () => ({ clear: () => {} }) as any,
    getNewText: () => ({ anchor: { set: () => {} }, visible: true }) as any,
    getNewBaseTexture: () => ({}) as any,
    getSpriteFrom: () => ({ anchor: { set: () => {} }, visible: true }) as any,
    Init: () => {},
    InitAnimation: () => {},
    blueprintContainer: {} as any,
    pixiApp: {
      stage: { addChild: () => {} },
      renderer: { width: 0, height: 0 },
    } as any,
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

  // #271. Leaving the editor route destroys the canvas and re-entering builds
  // a new one with a fresh camera. The build tool reaches the camera through
  // the CameraService.cameraService static, so it must be the live canvas's:
  // when it was the previous canvas's, picking Wire switched the dead camera
  // to Power, and new wires drew dimmed against the live one still on Base.
  describe("when the editor is re-entered", () => {
    let reentered: ComponentCanvasComponent;

    beforeEach(() => {
      fixture.destroy();
      const second = TestBed.createComponent(ComponentCanvasComponent);
      reentered = second.componentInstance;
      second.detectChanges();
    });

    it("makes its own camera the one the static hands out", () => {
      // Compared by identity: a failing toBe would try to diff two camera
      // graphs that reach the whole TestBed through their observers.
      expect(CameraService.cameraService === reentered["cameraService"]).toBe(
        true,
      );
    });

    it("draws with the overlay the build tool switches to", () => {
      const wire: any = {
        oniItem: { overlay: Overlay.Power },
        setInvisible: vi.fn(),
        cleanUp: vi.fn(),
        prepareBoundingBox: vi.fn(),
        updateTileables: vi.fn(),
      };

      TestBed.inject(BuildTool).changeItem(wire);

      expect(reentered["cameraService"].overlay).toBe(Overlay.Power);
    });
  });
});
