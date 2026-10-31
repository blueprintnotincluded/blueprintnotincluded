import { ComponentFixture, TestBed } from "@angular/core/testing";
import { LOCALE_ID, NO_ERRORS_SCHEMA } from "@angular/core";
import { Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { Subject } from "rxjs";

import {
  CameraService,
  Display,
  Overlay,
  Visualization,
} from "../../../../../../lib/index";
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
        {
          provide: BlueprintService,
          useValue: {
            metadata: {},
            rocketInteriorChanged$: new Subject<unknown>(),
            subscribeBlueprintChanged: () => {},
            setRocketInterior: () => {},
          },
        },
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

  it("offers the Rooms overlay in the overlay switcher", () => {
    const roomsItem = component.overlayMenuItems.find(
      (item) => item.id == Overlay.Room.toString(),
    );
    expect(roomsItem).toBeTruthy();
    expect(roomsItem!.label).toBe("Rooms");
  });

  // PrimeNG MenuItem.id is a string. Buildings compare the overlay loosely
  // and never noticed, but the element-note fade compares strictly, so a
  // string overlay left every element note dimmed until an F-key wrote a
  // number. The items must hand the camera the enum value itself.
  it("writes the enum value, not the item's string id, to the camera", () => {
    const camera = CameraService.cameraService;
    const run = (items: any[], id: number) =>
      items.find((item) => item.id == id.toString())!.command!({});

    run(component.overlayMenuItems, Overlay.Liquid);
    expect(camera.overlay).toBe(Overlay.Liquid);
    run(component.overlayMenuItems, Overlay.Base);
    expect(camera.overlay).toBe(Overlay.Base);

    run(component.displayMenuItems, Display.blueprint);
    expect(camera.display).toBe(Display.blueprint);

    run(component.visualizationMenuItems, Visualization.temperature);
    expect(camera.visualization).toBe(Visualization.temperature);
  });

  // The checkmark follows the open blueprint, wherever its interior was set:
  // the save dialog announces it on rocketInteriorChanged$, opening a
  // blueprint on blueprintChanged.
  it("checks the rocket interior the open blueprint carries", () => {
    const blueprintService = TestBed.inject(BlueprintService) as any;
    const checked = () =>
      component.rocketInteriorMenuItems
        .filter((item) => item.icon == "pi pi-fw pi-check")
        .map((item) => item.id);
    expect(checked()).toEqual(["rocket-interior:none"]);

    blueprintService.metadata = { rocketInterior: "medium" };
    blueprintService.rocketInteriorChanged$.next(null);
    expect(checked()).toEqual(["rocket-interior:medium"]);

    blueprintService.metadata = {};
    component.blueprintChanged({} as any);
    expect(checked()).toEqual(["rocket-interior:none"]);
  });

  it("links every other language from the current locale's root", () => {
    expect(component.languagesMenuItems.map((item) => item.url)).toEqual([
      "/zh-Hans",
      "/ru",
      "/ko",
    ]);

    const russian = new ComponentMenuComponent(
      TestBed.inject(AuthenticationService),
      TestBed.inject(ToolService),
      TestBed.inject(BlueprintService),
      "ru",
    );
    russian.ngOnInit();
    expect(russian.languagesMenuItems.map((item) => item.url)).toEqual([
      "/../en-US",
      "/../zh-Hans",
      "/../ko",
    ]);
  });
});
