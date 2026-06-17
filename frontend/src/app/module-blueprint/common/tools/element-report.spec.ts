import { ElementReport } from "./element-report";

const makeBuildableElement = (name: string, color = 0xff0000) => ({
  name,
  color,
});

const makeOniItem = (overrides: Partial<any> = {}) => ({
  isElement: false,
  buildableElementsArray: [makeBuildableElement("Iron")],
  materialMass: [100],
  secondaryMaterialCosts: [],
  ...overrides,
});

const makeBlueprintItem = (
  oniItem: any,
  buildableElements: any[],
  overrides: Partial<any> = {}
) => ({
  oniItem,
  buildableElements,
  mass: 50,
  ...overrides,
});

describe("ElementReport", () => {
  let mockBlueprintService: any;
  let mockBlueprint: any;
  let report: ElementReport;

  beforeEach(() => {
    mockBlueprint = {
      subscribeBlueprintChanged: vi.fn(),
      blueprintItems: [],
    };
    mockBlueprintService = { blueprint: mockBlueprint };
    report = new ElementReport(mockBlueprintService as any);
  });

  it("subscribes to blueprint changes on construction", () => {
    expect(mockBlueprint.subscribeBlueprintChanged).toHaveBeenCalledWith(
      report
    );
  });

  it("starts with empty data", () => {
    expect(report.data).toEqual([]);
  });

  describe("blueprintChanged", () => {
    it("triggers updateElementReport", () => {
      const spy = vi.spyOn(report, "updateElementReport");
      report.blueprintChanged();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("updateElementReport", () => {
    it("produces empty data when blueprint has no items", () => {
      mockBlueprint.blueprintItems = [];
      report.updateElementReport();
      expect(report.data).toEqual([]);
    });

    it("aggregates mass for a non-element building item", () => {
      const elem = makeBuildableElement("Steel");
      const item = makeBlueprintItem(
        makeOniItem({ buildableElementsArray: [elem], materialMass: [200] }),
        [elem]
      );
      mockBlueprint.blueprintItems = [item];
      report.updateElementReport();
      expect(report.data).toHaveLength(1);
      expect(report.data[0].totalMass).toBe(200);
      expect(report.data[0].buildableElement).toBe(elem);
    });

    it("sums mass for multiple items using the same element", () => {
      const elem = makeBuildableElement("Iron");
      const oniItem = makeOniItem({
        buildableElementsArray: [elem],
        materialMass: [100],
      });
      const item1 = makeBlueprintItem(oniItem, [elem]);
      const item2 = makeBlueprintItem(oniItem, [elem]);
      mockBlueprint.blueprintItems = [item1, item2];
      report.updateElementReport();
      expect(report.data).toHaveLength(1);
      expect(report.data[0].totalMass).toBe(200);
    });

    it("keeps separate entries for different elements", () => {
      const iron = makeBuildableElement("Iron");
      const steel = makeBuildableElement("Steel");
      const ironItem = makeOniItem({
        buildableElementsArray: [iron],
        materialMass: [100],
      });
      const steelItem = makeOniItem({
        buildableElementsArray: [steel],
        materialMass: [150],
      });
      mockBlueprint.blueprintItems = [
        makeBlueprintItem(ironItem, [iron]),
        makeBlueprintItem(steelItem, [steel]),
      ];
      report.updateElementReport();
      expect(report.data).toHaveLength(2);
    });

    it("sorts data by totalMass descending", () => {
      const iron = makeBuildableElement("Iron");
      const steel = makeBuildableElement("Steel");
      const ironOni = makeOniItem({
        buildableElementsArray: [iron],
        materialMass: [50],
      });
      const steelOni = makeOniItem({
        buildableElementsArray: [steel],
        materialMass: [300],
      });
      mockBlueprint.blueprintItems = [
        makeBlueprintItem(ironOni, [iron]),
        makeBlueprintItem(steelOni, [steel]),
      ];
      report.updateElementReport();
      expect(report.data[0].totalMass).toBeGreaterThan(
        report.data[1].totalMass
      );
      expect(report.data[0].buildableElement).toBe(steel);
    });

    it("adds mass from secondaryMaterialCosts", () => {
      const primary = makeBuildableElement("Iron");
      const secondary = makeBuildableElement("Fiber");
      const oniItem = makeOniItem({
        buildableElementsArray: [primary],
        materialMass: [100],
        secondaryMaterialCosts: [{ element: secondary, mass: 25 }],
      });
      mockBlueprint.blueprintItems = [makeBlueprintItem(oniItem, [primary])];
      report.updateElementReport();
      const fiberEntry = report.data.find(
        (d) => d.buildableElement === secondary
      );
      expect(fiberEntry).toBeDefined();
      expect(fiberEntry!.totalMass).toBe(25);
    });

    it("resets data on each call", () => {
      const elem = makeBuildableElement("Iron");
      const oniItem = makeOniItem({
        buildableElementsArray: [elem],
        materialMass: [100],
      });
      mockBlueprint.blueprintItems = [makeBlueprintItem(oniItem, [elem])];
      report.updateElementReport();
      mockBlueprint.blueprintItems = [];
      report.updateElementReport();
      expect(report.data).toEqual([]);
    });
  });

  describe("itemDestroyed / itemAdded", () => {
    it("itemDestroyed exists as a no-op", () => {
      expect(() => report.itemDestroyed()).not.toThrow();
    });

    it("itemAdded exists as a no-op", () => {
      expect(() => report.itemAdded({} as any)).not.toThrow();
    });
  });
});
