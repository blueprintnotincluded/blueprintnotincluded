import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";

import {
  BActiveRangeSideScreen,
  BlueprintItem,
  OniItem,
  UiSaveSettings,
} from "../../../../../../../../lib/index";

import { ActiveRangeScreenComponent } from "./active-range-screen.component";

describe("ActiveRangeScreenComponent", () => {
  let component: ActiveRangeScreenComponent;
  let fixture: ComponentFixture<ActiveRangeScreenComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ActiveRangeScreenComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ActiveRangeScreenComponent);
    component = fixture.componentInstance;
    // TODO: replace these garbage stubs which are needed to boot this component for a non-test
    OniItem.getOniItem = () => undefined as unknown as OniItem;
    component.blueprintItem = new BlueprintItem();
    component.blueprintItem.getUiSettings = () =>
      ({ values: [0, 1] } as UiSaveSettings);
    component.activeRangeSideScreen = new BActiveRangeSideScreen("test");
    // end TODO
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
