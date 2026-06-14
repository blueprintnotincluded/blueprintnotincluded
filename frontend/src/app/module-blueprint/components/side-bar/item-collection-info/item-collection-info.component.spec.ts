import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SameItemCollection } from "src/app/module-blueprint/common/tools/same-item-collection";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ItemCollectionInfoComponent } from "./item-collection-info.component";

describe("ItemCollectionInfoComponent", () => {
  let component: ItemCollectionInfoComponent;
  let fixture: ComponentFixture<ItemCollectionInfoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ItemCollectionInfoComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BlueprintService, useValue: {} },
        { provide: ToolService, useValue: {} },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemCollectionInfoComponent);
    component = fixture.componentInstance;
    // The template reads a wide slice of the collection; zIndex is kept
    // off the conduit values so showPipeContent stays false.
    component.itemCollection = {
      items: [{ buildableElements: [{ hasTag: () => false }] }],
      oniItem: {
        isInfo: false,
        iconUrl: null,
        buildableElementsArray: [],
        name: "Test",
        zIndex: -1,
      },
      nbElements: [0],
      temperatureWarning: false,
      subscribeSelected: () => {},
    } as unknown as SameItemCollection;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
