import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";

import { BlueprintItem } from "../../../../../../../../lib/index";
import { UiScreenContainerComponent } from "./ui-screen-container.component";

describe("UiScreenContainerComponent", () => {
  let component: UiScreenContainerComponent;
  let fixture: ComponentFixture<UiScreenContainerComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [UiScreenContainerComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(UiScreenContainerComponent);
    component = fixture.componentInstance;
    component.blueprintItem = {
      oniItem: { uiScreens: [] },
    } as unknown as BlueprintItem;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
