import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";

import {
  BBitSelectorSideScreen,
  BlueprintItem,
  OniItem,
  UiSaveSettings,
} from "../../../../../../../../lib/index";
import { BitSelectionScreenComponent } from "./bit-selection-screen.component";

describe("BitSelectionScreenComponent", () => {
  let component: BitSelectionScreenComponent;
  let fixture: ComponentFixture<BitSelectionScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BitSelectionScreenComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BitSelectionScreenComponent);
    component = fixture.componentInstance;
    // TODO: replace these garbage stubs which are needed to boot this component for a non-test
    OniItem.getOniItem = () => undefined as unknown as OniItem;
    component.blueprintItem = new BlueprintItem();
    component.blueprintItem.getUiSettings = () =>
      ({ values: [0] }) as UiSaveSettings;
    component.bitSelectorSideScreen = { id: "test" } as BBitSelectorSideScreen;
    // end TODO
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
