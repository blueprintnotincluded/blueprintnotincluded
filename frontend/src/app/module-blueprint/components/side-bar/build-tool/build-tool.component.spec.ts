import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";

import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ToolType } from "src/app/module-blueprint/common/tools/tool";
import { BlueprintHelpers } from "../../../../../../../lib/index";
import { BuildMenuService } from "src/app/module-blueprint/services/build-menu.service";
import { ComponentSideBuildToolComponent } from "./build-tool.component";

describe("ComponentSideBuildToolComponent", () => {
  let component: ComponentSideBuildToolComponent;
  let fixture: ComponentFixture<ComponentSideBuildToolComponent>;

  let buildTool: any;
  let toolService: any;
  let buildMenu: any;

  beforeEach(async () => {
    buildTool = {
      templateItemToBuild: {
        oniItem: { isElement: true },
        reloadCamera: false,
      },
      changeItem: vi.fn(),
      subscribeBuildItemChanged: vi.fn(),
      rotate: vi.fn(),
    };
    toolService = {
      buildTool,
      subscribeToolChanged: vi.fn(),
    };
    buildMenu = { openForItem: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [ComponentSideBuildToolComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ToolService, useValue: toolService },
        { provide: BuildMenuService, useValue: buildMenu },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentSideBuildToolComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("subscribes to build-item and tool changes", () => {
      expect(buildTool.subscribeBuildItemChanged).toHaveBeenCalledWith(
        component,
      );
      expect(toolService.subscribeToolChanged).toHaveBeenCalledWith(component);
    });
  });

  describe("oniItemsLoaded", () => {
    it("builds a default Tile and marks the database loaded", () => {
      const instance = { id: "Tile" } as any;
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue(instance);

      component.oniItemsLoaded();

      expect(spy).toHaveBeenCalledWith("Tile");
      expect(buildTool.changeItem).toHaveBeenCalledWith(instance);
      expect(component.databaseLoaded).toBe(true);
    });
  });

  describe("openBuildMenu", () => {
    it("opens the build menu on the current building's category", () => {
      component.currentItem = { id: "LiquidPump" } as any;
      component.openBuildMenu();
      expect(buildMenu.openForItem).toHaveBeenCalledWith("LiquidPump");
    });
  });

  // The card's Rotate button is a touch screen's only way to turn the brush;
  // its label names the key the action is on.
  describe("rotate", () => {
    it("turns the build tool's brush", () => {
      component.rotate();
      expect(buildTool.rotate).toHaveBeenCalled();
    });

    it("labels the button with the rotate key", () => {
      expect(component.rotateLabel).toBe("Rotate (O)");
    });
  });

  describe("dlcLabels", () => {
    it("is empty for a base-game building, so no marker renders", () => {
      expect(component.dlcLabels({ dlcIds: [] } as any)).toEqual([]);
      expect(component.dlcLabels({} as any)).toEqual([]);
    });

    it("maps raw Klei ids to pack names, falling back to the raw id", () => {
      expect(
        component.dlcLabels({ dlcIds: ["DLC5_ID", "DLC9_ID"] } as any),
      ).toEqual(["The Aquatic Planet Pack", "DLC9_ID"]);
    });
  });

  describe("changeElement", () => {
    it("writes the picked element onto the brush, not just a reload flag", () => {
      buildTool.templateItemToBuild.setElement = vi.fn();
      const newElement = { id: "Oxygen" } as any;

      component.changeElement({ newElement, index: 1 });

      expect(buildTool.templateItemToBuild.setElement).toHaveBeenCalledWith(
        "Oxygen",
        1,
      );
    });
  });

  describe("itemChanged", () => {
    it("stores the template item's oniItem as the current item", () => {
      const oniItem = { id: "Pump" } as any;
      component.itemChanged({ oniItem } as any);
      expect(component.currentItem).toBe(oniItem);
    });
  });

  describe("toolChanged", () => {
    it("leaves the brush alone for other tools", () => {
      const spy = vi.spyOn(BlueprintHelpers, "createInstance");

      component.toolChanged(ToolType.select);

      expect(spy).not.toHaveBeenCalled();
    });

    // The "B resets an already-configured element brush to Vacuum" bug:
    // re-entering the build tool fires toolChanged(build) even when nothing
    // actually changed, so it must not blindly rebuild every time.
    it("does not rebuild when the build tool already shows the same item (re-entering via B)", () => {
      const spy = vi.spyOn(BlueprintHelpers, "createInstance");
      buildTool.templateItemToBuild.oniItem = {
        id: "Element",
        isElement: true,
      };
      component.currentItem = { id: "Element" } as any;

      component.toolChanged(ToolType.build);

      expect(spy).not.toHaveBeenCalled();
      expect(buildTool.changeItem).not.toHaveBeenCalled();
    });

    it("rebuilds when the build tool shows a different item than currentItem", () => {
      const instance = { id: "Wire" } as any;
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue(instance);
      buildTool.templateItemToBuild.oniItem = { id: "Tile", isElement: false };
      component.currentItem = { id: "Wire" } as any;

      component.toolChanged(ToolType.build);

      expect(spy).toHaveBeenCalledWith("Wire");
      expect(buildTool.changeItem).toHaveBeenCalledWith(instance);
    });

    // The regression this guards: BuildTool.switchFrom() destroys the brush but
    // leaves it in the field, so on re-entry the id still matched and the
    // destroyed item was kept -- then drawn, killing the PIXI ticker. Repro was
    // Automation overlay -> element brush -> Select tool -> B.
    it("rebuilds when the matching template item has been destroyed", () => {
      const instance = { id: "Element" } as any;
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue(instance);
      buildTool.templateItemToBuild.oniItem = {
        id: "Element",
        isElement: true,
      };
      buildTool.templateItemToBuild.destroyed = true;
      component.currentItem = { id: "Element" } as any;

      component.toolChanged(ToolType.build);

      expect(spy).toHaveBeenCalledWith("Element");
      expect(buildTool.changeItem).toHaveBeenCalledWith(instance);
    });

    it("rebuilds when there is no template item yet", () => {
      const instance = { id: "Tile" } as any;
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue(instance);
      buildTool.templateItemToBuild = null as any;
      component.currentItem = { id: "Tile" } as any;

      component.toolChanged(ToolType.build);

      expect(spy).toHaveBeenCalledWith("Tile");
    });
  });
});
