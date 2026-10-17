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
import { HoverCardService } from "src/app/module-blueprint/services/hover-card.service";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ToolType } from "src/app/module-blueprint/common/tools/tool";

// The real DrawPixi constructs a PIXI.Application (WebGL) in Init(), which jsdom
// cannot provide. Inject a mock so the renderer never boots in the unit test.
// DrawRoomOverlay/DrawNotesOverlay/DrawRocketInterior (created in ngOnInit)
// need container/graphics/text/sprite/texture factories and the stage and
// blueprint container to attach to — plain stubs keep them inert.
function mockDrawPixi(): Partial<DrawPixi> {
  return {
    getNewContainer: () => ({ addChild: () => {}, visible: true }) as any,
    getNewGraphics: () => ({ clear: () => {} }) as any,
    getNewText: () => ({ anchor: { set: () => {} }, visible: true }) as any,
    getNewBaseTexture: () => ({}) as any,
    getSpriteFrom: () => ({ anchor: { set: () => {} }, visible: true }) as any,
    Init: () => {},
    InitAnimation: () => {},
    blueprintContainer: { addChild: () => {} } as any,
    pixiApp: {
      stage: { addChild: () => {}, addChildAt: () => {} },
      renderer: { width: 0, height: 0 },
    } as any,
  };
}

describe("ComponentCanvasComponent", () => {
  let component: ComponentCanvasComponent;
  let fixture: ComponentFixture<ComponentCanvasComponent>;
  let hoverCard: {
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    hoverCard = { show: vi.fn(), hide: vi.fn() };
    TestBed.configureTestingModule({
      declarations: [ComponentCanvasComponent],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        BuildTool,
        ElementReport,
        SelectTool,
        ScissorsTool,
        { provide: HoverCardService, useValue: hoverCard },
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

  describe("hover card", () => {
    const pointer = (x: number, y: number, pointerType = "mouse") => ({
      clientX: x,
      clientY: y,
      pointerType,
    });

    beforeEach(() => {
      const camera = component["cameraService"];
      camera.currentZoom = 20;
      camera.cameraOffset.x = 0;
      camera.cameraOffset.y = 5;
    });

    it("describes the cell under the pointer, anchored to that cell", () => {
      component.mouseMove(pointer(45, 10));

      expect(hoverCard.show).toHaveBeenLastCalledWith(
        { x: 2, y: 5 },
        { left: 40, top: 0, width: 20, height: 20 },
        false,
      );
    });

    it("hides when the pointer leaves the canvas", () => {
      component.mouseMove(pointer(45, 10));
      component.mouseOut({});
      expect(hoverCard.hide).toHaveBeenCalled();
    });

    it("stays off for a touch", () => {
      component.mouseMove(pointer(45, 10, "touch"));
      expect(hoverCard.show).not.toHaveBeenCalled();
    });

    it("hides while panning and comes back, re-rendered, when it ends", () => {
      component.mouseMove(pointer(45, 10));
      hoverCard.show.mockClear();

      component.mouseDrag({
        ...pointer(45, 10),
        dragX: 0,
        dragY: 0,
        dragButton: [false, false, true],
      });
      expect(hoverCard.hide).toHaveBeenCalled();
      expect(hoverCard.show).not.toHaveBeenCalled();

      component.mouseStopDrag({});
      expect(hoverCard.show).toHaveBeenLastCalledWith(
        { x: 2, y: 5 },
        expect.anything(),
        true,
      );
    });

    it("is off while a tool with its own ghost is active", () => {
      component.mouseMove(pointer(45, 10));
      hoverCard.show.mockClear();
      const toolService = TestBed.inject(ToolService);
      vi.spyOn(toolService, "currentToolType", "get").mockReturnValue(
        ToolType.build,
      );

      component.toolChanged(ToolType.build);
      component.mouseMove(pointer(65, 10));

      expect(hoverCard.hide).toHaveBeenCalled();
      expect(hoverCard.show).not.toHaveBeenCalled();
    });

    it("follows a zoom under a still pointer", () => {
      component.mouseMove(pointer(45, 10));
      component["followCameraWithHoverCard"]();
      component["cameraService"].currentZoom = 40;
      component["followCameraWithHoverCard"]();

      expect(hoverCard.show).toHaveBeenLastCalledWith(
        { x: 1, y: 5 },
        { left: 40, top: 0, width: 40, height: 40 },
        true,
      );
    });
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
