import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MessageService } from "primeng/api";

import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ReplaceElementComponent } from "./replace-element.component";

// Plain stand-ins: the lib planner compares elements by identity and reads
// only oniItem.isElement / oniItem.buildableElementsArray / buildableElements.
const cobalt = { id: "Cobaltite", name: "Cobalt Ore" } as any;
const copper = { id: "Cuprite", name: "Copper Ore" } as any;
const sandstone = { id: "SandStone", name: "Sandstone" } as any;
const plastic = { id: "Polypropylene", name: "Plastic" } as any;

const wireType = {
  name: "Wire",
  isElement: false,
  buildableElementsArray: [[cobalt, copper]],
};
const pipeType = {
  name: "Liquid Pipe",
  isElement: false,
  buildableElementsArray: [[cobalt, copper, sandstone]],
};
const trapType = {
  name: "Fish Trap",
  isElement: false,
  buildableElementsArray: [[plastic]],
};

function item(oniItem: any, ...elements: any[]) {
  return { oniItem, buildableElements: elements, setElement: vi.fn() };
}

describe("ReplaceElementComponent", () => {
  let component: ReplaceElementComponent;
  let fixture: ComponentFixture<ReplaceElementComponent>;
  let selectTool: any;
  let messageService: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    selectTool = {
      observersSelectionChanged: [] as any[],
      subscribeSelectionChanged: vi.fn((observer: any) =>
        selectTool.observersSelectionChanged.push(observer),
      ),
      selectedItems: [] as any[],
      selectionElement: null,
      replaceElement: vi.fn(),
    };
    messageService = { add: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [ReplaceElementComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ToolService, useValue: { selectTool } },
        { provide: MessageService, useValue: messageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplaceElementComponent);
    component = fixture.componentInstance;
  });

  function select(items: any[], seed: any = null) {
    selectTool.selectedItems = items;
    selectTool.selectionElement = seed;
    component.selectionChanged();
  }

  it("is hidden while nothing is selected", () => {
    fixture.detectChanges();
    expect(component.show).toBe(false);
    expect(component.canApply).toBe(false);
    expect(fixture.nativeElement.querySelector(".replace-strip")).toBeNull();
  });

  it("subscribes to selection changes once and unsubscribes on destroy", () => {
    fixture.detectChanges();
    expect(selectTool.subscribeSelectionChanged).toHaveBeenCalledTimes(1);
    expect(selectTool.observersSelectionChanged).toContain(component);
    fixture.destroy();
    expect(selectTool.observersSelectionChanged).not.toContain(component);
  });

  it("offers the selection's materials as X and preselects the first one", () => {
    fixture.detectChanges();
    select([item(wireType, cobalt), item(pipeType, sandstone)]);
    expect(component.fromChoices[0]).toEqual([cobalt, sandstone]);
    expect(component.fromElement[0]).toBe(cobalt);
    expect(component.show).toBe(true);
  });

  it("preselects the element the selection was gathered by", () => {
    fixture.detectChanges();
    select([item(wireType, cobalt), item(pipeType, sandstone)], sandstone);
    expect(component.fromElement[0]).toBe(sandstone);
  });

  it("keeps the chosen X across a reselection that still contains it", () => {
    fixture.detectChanges();
    select([item(wireType, cobalt), item(pipeType, sandstone)]);
    component.changeFrom({ newElement: sandstone, index: 0 });
    select([item(pipeType, sandstone), item(wireType, cobalt)], cobalt);
    expect(component.fromElement[0]).toBe(sandstone);
  });

  it("offers as Y only what some X slot can take, with a skip-count tooltip", () => {
    fixture.detectChanges();
    select([
      item(wireType, cobalt),
      item(pipeType, cobalt),
      item(trapType, plastic),
    ]);
    // Wire cannot take Sandstone, the pipe can; Plastic fits neither.
    expect(component.toChoices[0]).toEqual([copper, sandstone]);
    expect(component.toElement[0]).toBe(copper);
    expect(component.tooltipForCandidate(copper)).toBe("Copper Ore");
    expect(component.tooltipForCandidate(sandstone)).toBe(
      "Sandstone (1 selected building cannot be made of it)",
    );
    expect(component.canApply).toBe(true);
  });

  it("applies through the select tool and reports the outcome", () => {
    fixture.detectChanges();
    const skipped = item(trapType, plastic);
    select([item(wireType, cobalt), skipped]);
    selectTool.replaceElement.mockReturnValue({
      from: cobalt,
      to: copper,
      changes: [{ item: {}, slots: [0], blocked: [] }],
      skipped: [skipped, skipped],
    });

    component.apply();

    expect(selectTool.replaceElement).toHaveBeenCalledWith(cobalt, copper);
    expect(messageService.add).toHaveBeenCalledWith({
      severity: "success",
      summary: "Replace Cobalt Ore with Copper Ore",
      detail:
        "Replaced Cobalt Ore with Copper Ore on 1 building (2 skipped: Fish Trap cannot be made of Copper Ore)",
    });
  });

  it("does nothing without a usable X / Y pair", () => {
    fixture.detectChanges();
    select([item(trapType, plastic)]); // nothing else Plastic slots can take
    expect(component.toChoices[0]).toEqual([]);
    expect(component.canApply).toBe(false);
    component.apply();
    expect(selectTool.replaceElement).not.toHaveBeenCalled();
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("calls out buildings where another X slot could not take Y", () => {
    const sensor = item(
      { name: "Gas Germ Sensor", isElement: false, buildableElementsArray: [] },
      cobalt,
      cobalt,
    );
    const text = ReplaceElementComponent.describe({
      from: cobalt,
      to: copper,
      changes: [
        { item: sensor, slots: [0], blocked: [1] },
        { item: sensor, slots: [0], blocked: [1] },
        { item: item(wireType, cobalt), slots: [0], blocked: [] },
      ] as any,
      skipped: [],
    });
    expect(text).toBe(
      "Replaced Cobalt Ore with Copper Ore on 3 buildings (2 only partly: Gas Germ Sensor cannot be made of Copper Ore in every slot)",
    );
  });

  it("pluralises and lists each skipped building type once", () => {
    const text = ReplaceElementComponent.describe({
      from: cobalt,
      to: copper,
      changes: [
        { item: item(wireType, cobalt), slots: [0], blocked: [] },
        { item: item(wireType, cobalt), slots: [0], blocked: [] },
        { item: item(wireType, cobalt), slots: [0], blocked: [] },
      ] as any,
      skipped: [
        item(trapType, plastic),
        item(wireType, cobalt),
        item(trapType, plastic),
      ] as any,
    });
    expect(text).toBe(
      "Replaced Cobalt Ore with Copper Ore on 3 buildings (3 skipped: Fish Trap, Wire cannot be made of Copper Ore)",
    );
  });
});
