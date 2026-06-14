import { ComponentFixture, TestBed } from "@angular/core/testing";
import { LOCALE_ID, NO_ERRORS_SCHEMA } from "@angular/core";
import { Router } from "@angular/router";
import { MessageService } from "primeng/api";

import { CameraService } from "../../../../../../lib/index";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ComponentMenuComponent } from "./component-menu.component";

describe("ComponentMenuComponent", () => {
  let component: ComponentMenuComponent;
  let fixture: ComponentFixture<ComponentMenuComponent>;

  beforeEach(async () => {
    // The component subscribes to the CameraService singleton in its
    // constructor; instantiate one so the static accessor is populated.
    new CameraService(null);

    await TestBed.configureTestingModule({
      declarations: [ComponentMenuComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthenticationService,
          useValue: { isLoggedIn: () => false, getUserDetails: () => null },
        },
        { provide: MessageService, useValue: {} },
        {
          provide: ToolService,
          useValue: {
            subscribeToolChanged: () => {},
            changeTool: () => {},
            getTool: () => ({ visible: false }),
          },
        },
        { provide: BlueprintService, useValue: {} },
        { provide: Router, useValue: { navigate: () => {} } },
        { provide: LOCALE_ID, useValue: "en-US" },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
