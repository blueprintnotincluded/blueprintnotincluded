import { SameItemCollection } from "./same-item-collection";
import { CameraService } from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";

const makeOniItem = (elementCount = 1) => ({
  buildableElementsArray: Array.from({ length: elementCount }, (_, i) => ({
    name: `Element${i}`,
    color: 0xffffff,
  })),
  name: "TestItem",
});

const makeBlueprintItem = (temperature = 20, buildableElements?: any[]) => ({
  temperature,
  buildableElements: buildableElements ?? [{ name: "Iron", color: 0xaaaaaa }],
  selected: false,
  header: "Test Header",
});

describe("SameItemCollection", () => {
  let oniItem: any;
  let collection: SameItemCollection;
  let mockCameraService: {
    resetSinWave: ReturnType<typeof vi.fn>;
    setOverlayForItem: ReturnType<typeof vi.fn>;
  };
  let mockDestroyBlueprintItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCameraService = {
      resetSinWave: vi.fn(),
      setOverlayForItem: vi.fn(),
    };
    Object.defineProperty(CameraService, "cameraService", {
      get: () => mockCameraService,
      configurable: true,
    });

    mockDestroyBlueprintItem = vi.fn();
    Object.defineProperty(BlueprintService, "blueprintService", {
      get: () => ({
        blueprint: { destroyBlueprintItem: mockDestroyBlueprintItem },
      }),
      configurable: true,
    });

    oniItem = makeOniItem(1);
    collection = new SameItemCollection(oniItem as any);
  });

  describe("constructor", () => {
    it("initialises items as empty array", () => {
      expect(collection.items).toEqual([]);
    });

    it("initialises nbElements to zero for each element slot", () => {
      const multi = new SameItemCollection(makeOniItem(3) as any);
      expect(multi.nbElements).toEqual([0, 0, 0]);
    });

    it("initialises temperatureWarning as false", () => {
      expect(collection.temperatureWarning).toBe(false);
    });
  });

  describe("addItem", () => {
    it("adds a new item to the collection", () => {
      const item = makeBlueprintItem();
      collection.addItem(item as any);
      expect(collection.items).toHaveLength(1);
    });

    it("does not add the same item twice", () => {
      const item = makeBlueprintItem();
      collection.addItem(item as any);
      collection.addItem(item as any);
      expect(collection.items).toHaveLength(1);
    });

    it("updates nbElements after adding", () => {
      const elem = { name: "Iron" };
      const item = makeBlueprintItem(20, [elem]);
      collection.addItem(item as any);
      expect(collection.nbElements[0]).toBe(1);
    });

    it("counts unique elements across items", () => {
      const elemA = { name: "Iron" };
      const elemB = { name: "Steel" };
      const item1 = makeBlueprintItem(20, [elemA]);
      const item2 = makeBlueprintItem(20, [elemB]);
      collection.addItem(item1 as any);
      collection.addItem(item2 as any);
      expect(collection.nbElements[0]).toBe(2);
    });

    it("counts same element instance only once", () => {
      const elem = { name: "Iron" };
      const item1 = makeBlueprintItem(20, [elem]);
      const item2 = makeBlueprintItem(25, [elem]);
      collection.addItem(item1 as any);
      collection.addItem(item2 as any);
      expect(collection.nbElements[0]).toBe(1);
    });
  });

  describe("updateTemperatureWarning", () => {
    it("is false when all items share the same temperature", () => {
      collection.addItem(makeBlueprintItem(20) as any);
      collection.addItem(makeBlueprintItem(20) as any);
      expect(collection.temperatureWarning).toBe(false);
    });

    it("is true when items have different temperatures", () => {
      collection.addItem(makeBlueprintItem(20) as any);
      collection.addItem(makeBlueprintItem(30) as any);
      expect(collection.temperatureWarning).toBe(true);
    });

    it("is false for a single item", () => {
      collection.addItem(makeBlueprintItem(20) as any);
      expect(collection.temperatureWarning).toBe(false);
    });
  });

  describe("header getter", () => {
    it("returns header of the first item", () => {
      const item = makeBlueprintItem();
      collection.addItem(item as any);
      expect(collection.header).toBe("Test Header");
    });
  });

  describe("selected setter", () => {
    it("sets selected to true and triggers setSelection on items", () => {
      const item = makeBlueprintItem();
      collection.addItem(item as any);
      collection.selected = true;
      expect(item.selected).toBe(true);
    });

    it("resets camera on selection", () => {
      collection.addItem(makeBlueprintItem() as any);
      collection.selected = true;
      expect(mockCameraService.resetSinWave).toHaveBeenCalled();
    });

    it("sets overlay for the item's oniItem on selection", () => {
      collection.addItem(makeBlueprintItem() as any);
      collection.selected = true;
      expect(mockCameraService.setOverlayForItem).toHaveBeenCalledWith(oniItem);
    });

    it("notifies subscribeSelected observers when selected = true", () => {
      const observer = { selected: vi.fn() };
      collection.subscribeSelected(observer);
      collection.addItem(makeBlueprintItem() as any);
      collection.selected = true;
      expect(observer.selected).toHaveBeenCalled();
    });

    it("does not notify observers when selected = false", () => {
      const observer = { selected: vi.fn() };
      collection.subscribeSelected(observer);
      collection.addItem(makeBlueprintItem() as any);
      collection.selected = false;
      expect(observer.selected).not.toHaveBeenCalled();
    });

    it("unselects items when selected = false", () => {
      const item = makeBlueprintItem();
      collection.addItem(item as any);
      collection.selected = true;
      collection.selected = false;
      expect(item.selected).toBe(false);
    });

    it("selected getter reflects the last set value", () => {
      collection.selected = true;
      expect(collection.selected).toBe(true);
      collection.selected = false;
      expect(collection.selected).toBe(false);
    });
  });

  describe("destroyAll", () => {
    it("calls destroyBlueprintItem for each item", () => {
      const item1 = makeBlueprintItem();
      const item2 = makeBlueprintItem();
      collection.addItem(item1 as any);
      collection.addItem(item2 as any);
      collection.destroyAll();
      expect(mockDestroyBlueprintItem).toHaveBeenCalledTimes(2);
      expect(mockDestroyBlueprintItem).toHaveBeenCalledWith(item1);
      expect(mockDestroyBlueprintItem).toHaveBeenCalledWith(item2);
    });
  });
});
