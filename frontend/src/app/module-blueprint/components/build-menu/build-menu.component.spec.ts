import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Subject } from "rxjs";
import {
  BlueprintHelpers,
  BuildMenuCategory,
  BuildMenuItem,
  OniItem,
} from "../../../../../../lib/index";
import { ToolType } from "../../common/tools/tool";
import { CanvasRightClick } from "../../services/tool-service";
import { BuildMenuService } from "../../services/build-menu.service";
import { KeybindingService } from "../../services/keybinding.service";
import { KeyboardShortcutService } from "../../services/keyboard-shortcut.service";
import { BuildMenuComponent } from "./build-menu.component";

describe("BuildMenuComponent", () => {
  let fixture: ComponentFixture<BuildMenuComponent>;
  let component: BuildMenuComponent;
  let service: BuildMenuService;
  let shortcuts: KeyboardShortcutService;
  let toolService: any;

  const items = new Map<string, OniItem>(
    [
      ["Ladder", "Ladder"],
      ["Tile", "Tile"],
      ["LiquidPump", "Liquid Pump"],
      ["GasPump", "Gas Pump"],
    ].map(([id, name]) => [
      id,
      {
        id,
        name,
        iconUrl: `${id}.png`,
        dlcIds: id == "GasPump" ? ["EXPANSION1_ID"] : [],
        size: { x: 1, y: 1 },
        materialCategory: [],
        materialMass: [],
      } as unknown as OniItem,
    ]),
  );

  const press = (code: string, modifiers: Partial<KeyboardEventInit> = {}) => {
    const event = new KeyboardEvent("keydown", {
      code,
      cancelable: true,
      ...modifiers,
    });
    Object.defineProperty(event, "target", {
      value: document.createElement("div"),
    });
    return shortcuts.handleKeyEvent(event);
  };

  const keydownInSearch = (key: string) => {
    const event = new KeyboardEvent("keydown", { key, cancelable: true });
    component.onSearchKeydown(event);
    return event;
  };

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    toolService = {
      currentToolType: ToolType.select,
      changeTool: vi.fn((t: ToolType) => (toolService.currentToolType = t)),
      buildTool: {
        changeItem: vi.fn(),
        templateItemToBuild: { oniItem: { id: "Tile" } },
      },
      rightClicked: new Subject<CanvasRightClick>(),
    };
    shortcuts = new KeyboardShortcutService(new KeybindingService());
    service = new BuildMenuService(toolService, { dict: {} } as any, shortcuts);

    vi.spyOn(OniItem, "getOniItem").mockImplementation((id) => items.get(id)!);
    BuildMenuCategory.init();
    BuildMenuCategory.load([
      { category: 1, categoryName: "base", categoryIcon: "icon_base" },
      { category: 2, categoryName: "plumbing", categoryIcon: "icon_pl" },
      { category: 3, categoryName: "hvac", categoryIcon: "icon_hvac" },
    ] as BuildMenuCategory[]);
    BuildMenuCategory.buildMenuCategories[0].categoryShowName = "Base";
    BuildMenuCategory.buildMenuCategories[1].categoryShowName = "Plumbing";
    BuildMenuCategory.buildMenuCategories[2].categoryShowName = "Ventilation";
    BuildMenuItem.init();
    BuildMenuItem.load([
      { category: 1, buildingId: "Ladder", subcategory: "ladders" },
      { category: 1, buildingId: "Tile", subcategory: "tiles" },
      { category: 2, buildingId: "LiquidPump", subcategory: "pumps" },
      { category: 3, buildingId: "GasPump", subcategory: "pumps" },
    ] as BuildMenuItem[]);
    service.load();

    await TestBed.configureTestingModule({
      declarations: [BuildMenuComponent],
      imports: [FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BuildMenuService, useValue: service },
        { provide: KeyboardShortcutService, useValue: shortcuts },
      ],
    }).compileComponents();

    // jsdom's window is 1024x768: the desktop column.
    fixture = TestBed.createComponent(BuildMenuComponent);
    component = fixture.componentInstance;
    service.navBottom = 50;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  describe("column", () => {
    it("has Paint Element, then a button per category in database order", () => {
      const labels = [...el().querySelectorAll(".build-menu-category")].map(
        (b) => b.getAttribute("aria-label"),
      );
      expect(labels).toEqual([
        "Paint Element",
        "Base",
        "Plumbing",
        "Ventilation",
      ]);
    });

    it("opens a category's panel, and marks the category active", () => {
      (el().querySelectorAll(".build-menu-category")[2] as HTMLElement).click();
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-title")?.textContent).toBe(
        "Plumbing",
      );
      expect(el().querySelectorAll(".build-menu-category--active").length).toBe(
        1,
      );
    });

    // Hung from the top, a panel that shrinks as a search narrows keeps its
    // search box under the cursor; hung from the bottom, the box ran away.
    it("hangs the column and its panel from just under the nav", () => {
      (el().querySelectorAll(".build-menu-category")[2] as HTMLElement).click();
      fixture.detectChanges();
      const column = el().querySelector<HTMLElement>(".build-menu-column")!;
      const panel = el().querySelector<HTMLElement>(".build-menu-panel")!;
      expect(column.style.top).toBe("58px");
      expect(panel.style.top).toBe("58px");
      expect(panel.style.bottom).toBe("");
    });

    it("paints an element from its first button", () => {
      const paint = vi
        .spyOn(service, "paintElement")
        .mockImplementation(() => {});
      (el().querySelector(".build-menu-paint") as HTMLElement).click();
      expect(paint).toHaveBeenCalled();
    });

    it("shows a category's name and hotkey on hover", () => {
      vi.useFakeTimers();
      component.showCategoryTip(
        service.categories[1],
        el().querySelectorAll(".build-menu-category")[2],
      );
      vi.advanceTimersByTime(400);
      vi.useRealTimers();
      fixture.detectChanges();
      expect(
        el().querySelector(".build-menu-tip-title")?.textContent,
      ).toContain("Plumbing");
      expect(
        el().querySelector(".build-menu-tip-key")?.textContent?.trim(),
      ).toBe("5");
    });

    // A pointer crossing the column shouldn't flash a tip per button; once
    // one is up, the next one is instant.
    it("waits before the first tip, then shows the next at once", () => {
      vi.useFakeTimers();
      const buttons = el().querySelectorAll(".build-menu-category");
      component.showCategoryTip(service.categories[0], buttons[1]);
      vi.advanceTimersByTime(399);
      expect(component.tip).toBeNull();
      vi.advanceTimersByTime(1);
      expect(component.tip?.title).toBe("Base");
      component.hideTip();
      component.showCategoryTip(service.categories[1], buttons[2]);
      expect(component.tip?.title).toBe("Plumbing");
      // Left alone, the column cools down again.
      component.hideTip();
      vi.advanceTimersByTime(300);
      component.showCategoryTip(service.categories[0], buttons[1]);
      expect(component.tip).toBeNull();
      vi.useRealTimers();
    });
  });

  describe("panel", () => {
    beforeEach(() => {
      service.toggleCategory(1);
      fixture.detectChanges();
    });

    it("groups the category's buildings under subcategory headers", () => {
      const headers = [...el().querySelectorAll(".build-menu-group-title")].map(
        (h) => h.textContent,
      );
      expect(headers).toEqual(["Ladders", "Tiles"]);
    });

    it("highlights the building the build tool holds", () => {
      const current = el().querySelector(".build-menu-entry--current");
      expect(current?.textContent).toContain("Tile");
    });

    it("picks a building and stays open", () => {
      vi.spyOn(BlueprintHelpers, "createInstance").mockReturnValue({} as any);
      (el().querySelector(".build-menu-entry") as HTMLElement).click();
      fixture.detectChanges();
      expect(toolService.buildTool.changeItem).toHaveBeenCalled();
      expect(el().querySelector(".build-menu-panel")).not.toBeNull();
    });

    it("switches between grid and list", () => {
      expect(el().querySelector(".build-menu-entry--tile")).not.toBeNull();
      component.setViewMode("list");
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-entry--tile")).toBeNull();
      expect(el().querySelector(".build-menu-entry--row")).not.toBeNull();
    });

    it("closes from its close button", () => {
      (
        el().querySelector(
          '.build-menu-header button[aria-label="Close the build menu"]',
        ) as HTMLElement
      ).click();
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-panel")).toBeNull();
    });

    it("marks DLC buildings", () => {
      service.toggleCategory(3);
      fixture.detectChanges();
      expect(el().querySelector(".build-dlc-badge")).not.toBeNull();
    });

    it("drops a building's tooltip when the menu closes under it", () => {
      const entry = service.categories[0].groups[0].entries[0];
      component.showEntryTip(
        entry,
        el().querySelector(".build-menu-entry"),
        true,
      );
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-tip")).not.toBeNull();
      // Escape with focus on the canvas: the service closes the menu and the
      // hovered button leaves the DOM, so no mouseleave ever fires.
      press("Escape");
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-panel")).toBeNull();
      expect(el().querySelector(".build-menu-tip")).toBeNull();
    });

    it("drops a building's tooltip once the building is chosen", () => {
      const entry = service.categories[0].groups[0].entries[0];
      const button = el().querySelector(".build-menu-entry") as HTMLElement;
      component.showEntryTip(entry, button, true);
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-tip")).not.toBeNull();
      // The pointer stays on the entry after the click, so no mouseleave
      // fires; the panel stays open and the tip would otherwise sit over the
      // canvas the building is about to be placed on.
      button.click();
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-panel")).not.toBeNull();
      expect(el().querySelector(".build-menu-tip")).toBeNull();
    });
  });

  describe("search", () => {
    beforeEach(() => {
      service.toggleCategory(1);
      fixture.detectChanges();
      component.query = "pump";
      fixture.detectChanges();
    });

    it("lists matches from every category, labelled with theirs", () => {
      expect(el().querySelector(".build-menu-title")?.textContent).toBe(
        "SEARCH RESULTS",
      );
      const rows = [...el().querySelectorAll(".build-menu-results li")].map(
        (row) => [
          row.querySelector(".build-menu-entry-name")?.textContent,
          row.querySelector(".build-menu-entry-category")?.textContent,
        ],
      );
      expect(rows).toEqual([
        ["Liquid Pump", "Plumbing"],
        ["Gas Pump", "Ventilation"],
      ]);
    });

    it("says so when nothing matches", () => {
      component.query = "zzzz";
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-empty")?.textContent).toBe(
        "NO RESULTS FOUND",
      );
    });

    it("ignores the row that scrolls under a resting pointer", async () => {
      const rows = el().querySelectorAll<HTMLElement>(
        ".build-menu-results li button",
      );
      const enter = (index: number, clientX: number, clientY: number) =>
        rows[index].dispatchEvent(
          new MouseEvent("mouseenter", { clientX, clientY }),
        );
      component.trackPointer(
        new MouseEvent("mousemove", { clientX: 40, clientY: 80 }),
      );
      keydownInSearch("ArrowDown");
      await new Promise((resolve) => setTimeout(resolve));
      expect(component.highlight).toBe(1);
      // The list scrolled and the browser re-entered row 0 from the same spot.
      enter(0, 40, 80);
      expect(component.highlight).toBe(1);
      // The pointer actually moved: the mouse is in charge again.
      enter(0, 41, 80);
      expect(component.highlight).toBe(0);
    });

    it("moves through the results with the arrow keys, and Enter picks", () => {
      vi.spyOn(BlueprintHelpers, "createInstance").mockImplementation(
        (id) => ({ id }) as any,
      );
      keydownInSearch("ArrowDown");
      keydownInSearch("ArrowDown");
      expect(component.highlight).toBe(1);
      keydownInSearch("ArrowUp");
      keydownInSearch("ArrowDown");
      const enter = keydownInSearch("Enter");
      expect(enter.defaultPrevented).toBe(true);
      expect(toolService.buildTool.changeItem).toHaveBeenCalledWith({
        id: "GasPump",
      });
    });

    it("clears the query on Escape, then closes on the next", () => {
      keydownInSearch("Escape");
      expect(service.query).toBe("");
      expect(service.isOpen).toBe(true);
      keydownInSearch("Escape");
      expect(service.isOpen).toBe(false);
    });

    it("leaves other keys to the text box", () => {
      expect(keydownInSearch("p").defaultPrevented).toBe(false);
    });

    it("clears the query from its × button", () => {
      (el().querySelector(".build-menu-search-clear") as HTMLElement).click();
      expect(service.query).toBe("");
    });
  });

  describe("shortcuts", () => {
    it("opens a category from its number key, and closes it from the same key", () => {
      expect(press("Digit5")).toBe(true);
      expect(service.openCategoryId).toBe(2);
      press("Digit5");
      expect(service.isOpen).toBe(false);
    });

    it("declines a category key the database has no category for", () => {
      expect(press("Digit2")).toBe(false);
    });

    it("focuses the search on Ctrl+F, opening the first category", () => {
      const focus = vi.fn();
      service.focusSearchRequests.subscribe(focus);
      expect(press("KeyF", { ctrlKey: true })).toBe(true);
      expect(service.openCategoryId).toBe(1);
      expect(focus).toHaveBeenCalled();
    });

    it("stops answering once the editor is gone", () => {
      fixture.destroy();
      expect(press("Digit5")).toBe(false);
      expect(press("KeyF", { ctrlKey: true })).toBe(false);
    });
  });

  describe("small screens", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 390,
      });
      fixture.detectChanges();
    });

    afterEach(() => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 1024,
      });
    });

    it("shows one launcher instead of the column", () => {
      expect(el().querySelector(".build-menu-column")).toBeNull();
      expect(el().querySelector(".build-menu-launcher")).not.toBeNull();
    });

    it("has no launcher until the database has loaded", () => {
      service.categories = [];
      fixture.detectChanges();
      expect(el().querySelector(".build-menu-launcher")).toBeNull();
    });

    it("opens a sheet with the categories as a row", () => {
      component.toggleSheet();
      fixture.detectChanges();
      expect(
        el().querySelector(".build-menu-sheet .build-menu-row"),
      ).not.toBeNull();
      // On the current building's category.
      expect(service.openCategoryId).toBe(1);
    });

    it("gets out of the way once a building is picked", () => {
      vi.spyOn(BlueprintHelpers, "createInstance").mockReturnValue({} as any);
      component.toggleSheet();
      component.choose(service.categories[0].groups[0].entries[0]);
      expect(service.isOpen).toBe(false);
    });
  });
});
