import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";

import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ToolType } from "src/app/module-blueprint/common/tools/tool";
import {
  BlueprintHelpers,
  BlueprintItemElement,
  BuildMenuCategory,
  OniItem,
} from "../../../../../../../lib/index";
import { BlueprintItemInfo } from "../../../../../../../lib/src/blueprint/blueprint-item-info";
import { ComponentSideBuildToolComponent } from "./build-tool.component";

// A lightweight stand-in for primeng's Popover with the methods the
// component calls. QueryList is faked as an array-with-`last` + `forEach`.
function makePanel() {
  return { hide: vi.fn(), show: vi.fn(), toggle: vi.fn() };
}
function makePanelList(panels: any[]) {
  return {
    last: panels[panels.length - 1],
    forEach: (cb: (p: any) => void) => panels.forEach(cb),
  } as any;
}

describe("ComponentSideBuildToolComponent", () => {
  let component: ComponentSideBuildToolComponent;
  let fixture: ComponentFixture<ComponentSideBuildToolComponent>;

  let buildTool: any;
  let toolService: any;

  beforeEach(async () => {
    buildTool = {
      templateItemToBuild: {
        oniItem: { isElement: true },
        reloadCamera: false,
      },
      changeItem: vi.fn(),
      subscribeBuildItemChanged: vi.fn(),
    };
    toolService = {
      buildTool,
      subscribeToolChanged: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [ComponentSideBuildToolComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: ToolService, useValue: toolService }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentSideBuildToolComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("constructor", () => {
    it("subscribes to build-item and tool changes", () => {
      expect(buildTool.subscribeBuildItemChanged).toHaveBeenCalledWith(
        component,
      );
      expect(toolService.subscribeToolChanged).toHaveBeenCalledWith(component);
    });
  });

  describe("getters", () => {
    it("currentItemToBuild proxies the build tool template", () => {
      expect(component.currentItemToBuild).toBe(buildTool.templateItemToBuild);
    });

    it("isGasLiquid reflects the template's isElement flag", () => {
      expect(component.isGasLiquid).toBe(true);
      buildTool.templateItemToBuild.oniItem.isElement = false;
      expect(component.isGasLiquid).toBe(false);
    });

    it("buildMenuCategories exposes the static category list", () => {
      expect(component.buildMenuCategories).toBe(
        BuildMenuCategory.buildMenuCategories,
      );
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
      spy.mockRestore();
    });
  });

  describe("showCategories", () => {
    it("toggles the category panel and hides all non-last item panels", () => {
      const a = makePanel();
      const b = makePanel();
      const last = makePanel();
      component.categoryPanel = makePanel() as any;
      component.itemPanels = makePanelList([a, b, last]);

      const event = { evt: true };
      component.showCategories(event);

      expect(component.categoryPanel.toggle).toHaveBeenCalledWith(event);
      expect(a.hide).toHaveBeenCalled();
      expect(b.hide).toHaveBeenCalled();
      expect(last.hide).not.toHaveBeenCalled();
    });
  });

  describe("paintElement", () => {
    it("creates a Water element item, builds it, and hides the panel", () => {
      // The lib database isn't loaded in unit tests; stub the lookup the
      // BlueprintItem constructor performs.
      const getOniItem = vi
        .spyOn(OniItem, "getOniItem")
        .mockReturnValue({} as any);
      const setElement = vi
        .spyOn(BlueprintItemElement.prototype, "setElement")
        .mockImplementation(() => {});
      component.categoryPanel = makePanel() as any;

      component.paintElement();

      expect(setElement).toHaveBeenCalledWith("Water", 0);
      expect(buildTool.changeItem).toHaveBeenCalledWith(
        expect.any(BlueprintItemElement),
      );
      expect(component.categoryPanel.hide).toHaveBeenCalled();
      setElement.mockRestore();
      getOniItem.mockRestore();
    });
  });

  describe("addInfo", () => {
    it("creates an info item, builds it, and hides the panel", () => {
      const getOniItem = vi
        .spyOn(OniItem, "getOniItem")
        .mockReturnValue({} as any);
      component.categoryPanel = makePanel() as any;

      component.addInfo();

      expect(buildTool.changeItem).toHaveBeenCalledWith(
        expect.any(BlueprintItemInfo),
      );
      expect(component.categoryPanel.hide).toHaveBeenCalled();
      getOniItem.mockRestore();
    });
  });

  describe("chooseItem", () => {
    it("hides every panel, records the item, and rebuilds it", () => {
      const a = makePanel();
      const b = makePanel();
      component.itemPanels = makePanelList([a, b]);
      const instance = { id: "Tile" } as any;
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue(instance);
      const item = { id: "Tile" } as any;

      component.chooseItem(item);

      expect(a.hide).toHaveBeenCalled();
      expect(b.hide).toHaveBeenCalled();
      expect(component.currentItem).toBe(item);
      expect(spy).toHaveBeenCalledWith("Tile");
      expect(buildTool.changeItem).toHaveBeenCalledWith(instance);
      spy.mockRestore();
    });
  });

  describe("changeElement", () => {
    it("flags the template for a camera reload", () => {
      buildTool.templateItemToBuild.reloadCamera = false;
      component.changeElement({} as any);
      expect(buildTool.templateItemToBuild.reloadCamera).toBe(true);
    });
  });

  describe("uiItemChanged", () => {
    it("rebuilds the current item from its id", () => {
      const instance = { id: "Ladder" } as any;
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue(instance);
      component.currentItem = { id: "Ladder" } as any;

      component.uiItemChanged();

      expect(spy).toHaveBeenCalledWith("Ladder");
      expect(buildTool.changeItem).toHaveBeenCalledWith(instance);
      spy.mockRestore();
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
    it("rebuilds the item and hides panels when the build tool is selected", () => {
      const spy = vi
        .spyOn(BlueprintHelpers, "createInstance")
        .mockReturnValue({ id: "Tile" } as any);
      component.currentItem = { id: "Tile" } as any;
      const a = makePanel();
      component.itemPanels = makePanelList([a]);

      component.toolChanged(ToolType.build);

      expect(spy).toHaveBeenCalled();
      expect(a.hide).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("only hides panels for non-build tools", () => {
      const spy = vi.spyOn(BlueprintHelpers, "createInstance");
      const a = makePanel();
      component.itemPanels = makePanelList([a]);

      component.toolChanged(ToolType.select);

      expect(spy).not.toHaveBeenCalled();
      expect(a.hide).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("tolerates missing item panels", () => {
      component.itemPanels = null as any;
      expect(() => component.toolChanged(ToolType.select)).not.toThrow();
    });
  });

  describe("onFocus", () => {
    it("is a no-op that does not throw", () => {
      expect(() => component.onFocus()).not.toThrow();
    });
  });
});
