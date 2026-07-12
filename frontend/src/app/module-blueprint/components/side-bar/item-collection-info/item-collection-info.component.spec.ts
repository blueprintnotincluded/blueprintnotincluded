import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SameItemCollection } from "src/app/module-blueprint/common/tools/same-item-collection";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ToolType } from "src/app/module-blueprint/common/tools/tool";
import { BlueprintHelpers, ZIndex } from "../../../../../../../lib/index";
import { ItemCollectionInfoComponent } from "./item-collection-info.component";

describe("ItemCollectionInfoComponent", () => {
  let component: ItemCollectionInfoComponent;
  let fixture: ComponentFixture<ItemCollectionInfoComponent>;

  let selectTool: any;
  let buildTool: any;
  let toolService: any;
  let blueprintChanged: ReturnType<typeof vi.fn>;
  let blueprintService: any;

  function makeCollection(overrides: Partial<any> = {}): SameItemCollection {
    return {
      items: [
        {
          buildableElements: [{ hasTag: () => false }],
          setElement: vi.fn(),
          temperature: 0,
        },
      ],
      oniItem: {
        isInfo: false,
        iconUrl: null,
        buildableElementsArray: [],
        name: "Test",
        zIndex: -1,
      },
      nbElements: [0],
      temperatureWarning: false,
      subscribeSelected: vi.fn(),
      updateNbElements: vi.fn(),
      updateTemperatureWarning: vi.fn(),
      ...overrides,
    } as unknown as SameItemCollection;
  }

  beforeEach(async () => {
    selectTool = {
      buildingsDestroy: vi.fn(),
      selectAllLike: vi.fn(),
      selectThis: vi.fn(),
    };
    buildTool = { changeItem: vi.fn() };
    toolService = {
      selectTool,
      buildTool,
      changeTool: vi.fn(),
    };
    blueprintChanged = vi.fn();
    blueprintService = {
      blueprint: { emitBlueprintChanged: blueprintChanged },
    };

    await TestBed.configureTestingModule({
      declarations: [ItemCollectionInfoComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BlueprintService, useValue: blueprintService },
        { provide: ToolService, useValue: toolService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemCollectionInfoComponent);
    component = fixture.componentInstance;
    component.itemCollection = makeCollection();
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("subscribes itself to the collection's selection events", () => {
      expect(component.itemCollection.subscribeSelected).toHaveBeenCalledWith(
        component,
      );
    });

    it("renders a pluralized label for multiple items", () => {
      const fix = TestBed.createComponent(ItemCollectionInfoComponent);
      fix.componentInstance.itemCollection = makeCollection({
        items: [
          { buildableElements: [{ hasTag: () => false }] },
          { buildableElements: [{ hasTag: () => false }] },
        ],
      });
      fix.detectChanges();
      expect(fix.componentInstance.nbItems).toContain("2");
      expect(fix.componentInstance.nbItems).toContain("items");
    });

    it("renders a singular label for a single item", () => {
      expect(component.nbItems).toContain("1");
      expect(component.nbItems).not.toContain("items");
    });
  });

  describe("forceTag", () => {
    it("returns 'Liquid' for liquid conduits", () => {
      component.itemCollection.oniItem.zIndex = ZIndex.LiquidConduits;
      expect(component.forceTag).toBe("Liquid");
    });

    it("returns 'Gas' for gas conduits", () => {
      component.itemCollection.oniItem.zIndex = ZIndex.GasConduits;
      expect(component.forceTag).toBe("Gas");
    });

    it("returns undefined for non-conduit items", () => {
      expect(component.forceTag).toBeUndefined();
    });
  });

  describe("showPipeContent / getPipeElement", () => {
    it("is false and yields no pipe element for non-conduits", () => {
      expect(component.showPipeContent).toBe(false);
      expect(component.getPipeElement()).toBeUndefined();
    });

    it("returns the wire's pipeElement when showing pipe content", () => {
      component.itemCollection = makeCollection({
        items: [{ pipeElement: "element-7" } as any],
        oniItem: { zIndex: ZIndex.LiquidConduits } as any,
      });
      expect(component.showPipeContent).toBe(true);
      expect(component.getPipeElement()).toBe("element-7");
    });
  });

  describe("isGasLiquid", () => {
    it("is true when the first element is tagged Gas", () => {
      component.itemCollection = makeCollection({
        items: [
          { buildableElements: [{ hasTag: (t: string) => t === "Gas" }] },
        ],
      });
      expect(component.isGasLiquid).toBe(true);
    });

    it("is false when no gas/liquid tag is present", () => {
      expect(component.isGasLiquid).toBe(false);
    });
  });

  describe("tool delegations", () => {
    it("buildingsDestroy forwards the collection to the select tool", () => {
      component.buildingsDestroy();
      expect(selectTool.buildingsDestroy).toHaveBeenCalledWith(
        component.itemCollection,
      );
    });

    it("buildingsCopy switches to the build tool with a cloned item", () => {
      const clone = { cloned: true } as any;
      const cloneSpy = vi
        .spyOn(BlueprintHelpers, "cloneBlueprintItem")
        .mockReturnValue(clone);

      component.buildingsCopy();

      expect(toolService.changeTool).toHaveBeenCalledWith(ToolType.build);
      expect(cloneSpy).toHaveBeenCalledWith(component.itemCollection.items[0]);
      expect(buildTool.changeItem).toHaveBeenCalledWith(clone);
      cloneSpy.mockRestore();
    });

    it("selectEvery selects all items like the first one", () => {
      component.selectEvery();
      expect(selectTool.selectAllLike).toHaveBeenCalledWith(
        component.itemCollection.items[0],
      );
    });

    it("selectThisInfo forwards to the select tool", () => {
      const info = { id: "info" } as any;
      component.selectThisInfo(info);
      expect(selectTool.selectThis).toHaveBeenCalledWith(info);
    });
  });

  describe("selected", () => {
    it("focuses the host focus element", () => {
      const focus = vi.fn();
      component.focusElement = { nativeElement: { focus } } as any;
      component.selected();
      expect(focus).toHaveBeenCalled();
    });
  });

  describe("changeElement", () => {
    it("sets the element on every item then emits a change", () => {
      const setElement = vi.fn();
      component.itemCollection = makeCollection({
        items: [{ setElement }, { setElement }],
        updateNbElements: vi.fn(),
      });

      component.changeElement({ newElement: { id: "el-3" }, index: 1 } as any);

      expect(setElement).toHaveBeenCalledTimes(2);
      expect(setElement).toHaveBeenCalledWith("el-3", 1);
      expect(component.itemCollection.updateNbElements).toHaveBeenCalled();
      expect(blueprintChanged).toHaveBeenCalled();
    });
  });

  describe("changePipeElement", () => {
    it("assigns the pipe element to every item and emits a change", () => {
      const items = [{ pipeElement: null }, { pipeElement: null }];
      component.itemCollection = makeCollection({ items: items as any });

      component.changePipeElement("water" as any);

      expect(items[0].pipeElement).toBe("water");
      expect(items[1].pipeElement).toBe("water");
      expect(blueprintChanged).toHaveBeenCalled();
    });
  });

  describe("changeTemperature", () => {
    it("sets the temperature on every item and updates the warning", () => {
      const items = [{ temperature: 0 }, { temperature: 0 }];
      const updateTemperatureWarning = vi.fn();
      component.itemCollection = makeCollection({
        items: items as any,
        updateTemperatureWarning,
      });

      component.changeTemperature(310);

      expect(items[0].temperature).toBe(310);
      expect(items[1].temperature).toBe(310);
      expect(updateTemperatureWarning).toHaveBeenCalled();
    });
  });
});
