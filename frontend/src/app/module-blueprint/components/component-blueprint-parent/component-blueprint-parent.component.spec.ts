import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { Observable, of, throwError } from "rxjs";

import { DatePipe } from "@angular/common";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BuildTool } from "src/app/module-blueprint/common/tools/build-tool";
import { ComponentBlueprintParentComponent } from "./component-blueprint-parent.component";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { ElementReport } from "src/app/module-blueprint/common/tools/element-report";
import { SelectTool } from "src/app/module-blueprint/common/tools/select-tool";
import { ScissorsTool } from "src/app/module-blueprint/common/tools/scissors-tool";
import { MessageService } from "primeng/api";
import { HttpClient } from "@angular/common/http";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { GameStringService } from "src/app/module-blueprint/services/game-string-service";
import { KeyboardShortcutService } from "src/app/module-blueprint/services/keyboard-shortcut.service";
import { UserService } from "src/app/module-blueprint/services/user-service";

// TODO: spec is incomplete — missing providers for MessageService, BlueprintService,
// ToolService, and GameStringService. Add stubs for these before re-enabling.
describe.skip("ComponentBlueprintParentComponent", () => {
  let component: ComponentBlueprintParentComponent;
  let fixture: ComponentFixture<ComponentBlueprintParentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ComponentBlueprintParentComponent],
      imports: [RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of([{ width: 200, height: 100 }]),
          },
        },
        AuthenticationService,
        BuildTool,
        DatePipe,
        ElementReport,
        SelectTool,
        ScissorsTool,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentBlueprintParentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should unsubscribe from blueprintService on destroy", () => {
    const blueprintService = TestBed.inject(BlueprintService);
    const observersBefore = blueprintService.observersBlueprintChanged.length;
    fixture.destroy();
    expect(blueprintService.observersBlueprintChanged.length).toBe(
      observersBefore - 1,
    );
  });
});

// The hidden-pack notice (#14 option c) is testable on its own: every
// collaborator is a stub and the component is never initialised (no
// detectChanges), so the database fetch, canvas and dialogs stay out of it.
describe("ComponentBlueprintParentComponent.noticeHiddenDlcs", () => {
  let component: ComponentBlueprintParentComponent;
  let messageService: { add: ReturnType<typeof vi.fn> };
  let authService: { isLoggedIn: ReturnType<typeof vi.fn> };
  let userService: { getDlcPreferences: ReturnType<typeof vi.fn> };
  let blueprintService: {
    id: string | null;
    requiredDlcs: string[] | null;
    unsubscribeBlueprintChanged: ReturnType<typeof vi.fn>;
    unsubscribeImportError: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    messageService = { add: vi.fn() };
    authService = { isLoggedIn: vi.fn().mockReturnValue(true) };
    userService = {
      getDlcPreferences: vi
        .fn()
        .mockReturnValue(of({ excludedDlcs: ["EXPANSION1_ID"] })),
    };
    // The two unsubscribes are what ngOnDestroy calls at fixture cleanup
    blueprintService = {
      id: "bp-1",
      requiredDlcs: null,
      unsubscribeBlueprintChanged: vi.fn(),
      unsubscribeImportError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [ComponentBlueprintParentComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({}), url: of([]) } },
        { provide: AuthenticationService, useValue: authService },
        { provide: BlueprintService, useValue: blueprintService },
        { provide: ToolService, useValue: {} },
        { provide: HttpClient, useValue: {} },
        { provide: GameStringService, useValue: {} },
        { provide: KeyboardShortcutService, useValue: {} },
        { provide: UserService, useValue: userService },
      ],
    })
      // The component declares its own MessageService; swap that one out
      .overrideComponent(ComponentBlueprintParentComponent, {
        set: {
          providers: [{ provide: MessageService, useValue: messageService }],
        },
      })
      .compileComponents();

    component = TestBed.createComponent(
      ComponentBlueprintParentComponent,
    ).componentInstance;
  });

  it("warns, sticky, naming the hidden pack the blueprint needs", () => {
    component.noticeHiddenDlcs(["EXPANSION1_ID", "DLC2_ID"]);
    expect(messageService.add).toHaveBeenCalledTimes(1);
    const toast = messageService.add.mock.calls[0][0];
    expect(toast.severity).toBe("warn");
    expect(toast.sticky).toBe(true);
    expect(toast.detail).toContain("Spaced Out!");
    expect(toast.detail).not.toContain("Frosty");
  });

  it("stays silent when no required pack is hidden", () => {
    component.noticeHiddenDlcs(["DLC2_ID"]);
    expect(userService.getDlcPreferences).toHaveBeenCalled();
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("never reads the preference for a base-game or non-server blueprint", () => {
    component.noticeHiddenDlcs([]);
    component.noticeHiddenDlcs(null);
    expect(userService.getDlcPreferences).not.toHaveBeenCalled();
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("never reads the preference for a logged-out visitor", () => {
    authService.isLoggedIn.mockReturnValue(false);
    component.noticeHiddenDlcs(["EXPANSION1_ID"]);
    expect(userService.getDlcPreferences).not.toHaveBeenCalled();
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("stays silent when the preference is empty", () => {
    userService.getDlcPreferences.mockReturnValue(of({ excludedDlcs: [] }));
    component.noticeHiddenDlcs(["EXPANSION1_ID"]);
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("drops the notice if another blueprint was opened meanwhile", () => {
    userService.getDlcPreferences.mockReturnValue(
      new Observable((sub) => {
        blueprintService.id = "bp-2";
        sub.next({ excludedDlcs: ["EXPANSION1_ID"] });
        sub.complete();
      }),
    );
    component.noticeHiddenDlcs(["EXPANSION1_ID"]);
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("swallows a failed preference read", () => {
    userService.getDlcPreferences.mockReturnValue(
      throwError(() => new Error("401")),
    );
    expect(() => component.noticeHiddenDlcs(["EXPANSION1_ID"])).not.toThrow();
    expect(messageService.add).not.toHaveBeenCalled();
  });
});

// The rocket notice, tested the same way as the hidden-pack one: stubs all
// round, component never initialised. The modules are structural stand-ins that
// satisfy lib's rocketStackWarnings -- the analysis itself is covered in the lib
// suite against the real game database.
describe("ComponentBlueprintParentComponent.noticeRocketStacks", () => {
  let component: ComponentBlueprintParentComponent;
  let messageService: { add: ReturnType<typeof vi.fn> };
  let blueprintService: any;

  const engine = (id: string, y: number) => ({
    id,
    position: { x: 0, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    oniItem: {
      isRocketModule: true,
      attachableTo: "Rocket",
      attachablePosition: { x: 0, y: 0 },
      rocketAttachPoint: { offset: { x: 0, y: 2 }, tag: "Rocket" },
      size: { x: 3, y: 2 },
      rocketModule: {
        buildConditions: ["LimitOneEngine", "EngineOnBottom"],
        engineMaxHeight: 10,
      },
    },
  });

  beforeEach(async () => {
    messageService = { add: vi.fn() };
    blueprintService = {
      id: "bp-1",
      name: "Rocket",
      requiredDlcs: null,
      blueprint: { blueprintItems: [] },
      exportBlueprintFile: vi.fn(),
      copyBlueprintShareString: vi.fn().mockResolvedValue(undefined),
      unsubscribeBlueprintChanged: vi.fn(),
      unsubscribeImportError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [ComponentBlueprintParentComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({}), url: of([]) } },
        {
          provide: AuthenticationService,
          useValue: { isLoggedIn: vi.fn().mockReturnValue(false) },
        },
        { provide: BlueprintService, useValue: blueprintService },
        { provide: ToolService, useValue: {} },
        { provide: HttpClient, useValue: {} },
        { provide: GameStringService, useValue: {} },
        { provide: KeyboardShortcutService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    })
      .overrideComponent(ComponentBlueprintParentComponent, {
        set: {
          providers: [{ provide: MessageService, useValue: messageService }],
        },
      })
      .compileComponents();

    component = TestBed.createComponent(
      ComponentBlueprintParentComponent,
    ).componentInstance;
  });

  const rocketToasts = () =>
    messageService.add.mock.calls
      .map((call) => call[0])
      .filter((toast) => String(toast.summary).includes("rocket"));
  const twoEngines = () => [engine("CO2Engine", 0), engine("SugarEngine", 2)];

  it("says nothing about a blueprint with no rocket in it", () => {
    component.noticeRocketStacks();
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("says nothing about a sound stack", () => {
    blueprintService.blueprint.blueprintItems = [engine("CO2Engine", 0)];
    component.noticeRocketStacks();
    expect(messageService.add).not.toHaveBeenCalled();
  });

  it("gives a heads-up, not an error, when a stack would be refused in game", () => {
    blueprintService.blueprint.blueprintItems = twoEngines();

    component.noticeRocketStacks();

    expect(messageService.add).toHaveBeenCalledTimes(1);
    const toast = messageService.add.mock.calls[0][0];
    expect(toast.severity).toBe("info");
    expect(toast.sticky).toBeFalsy();
    expect(toast.summary).toContain("may not build");
    expect(toast.detail).toContain("SugarEngine");
    expect(toast.detail).toContain("bottom module");
    expect(toast.detail).toContain("2 engines");
  });

  it("does not repeat itself while the problems are unchanged", () => {
    blueprintService.blueprint.blueprintItems = twoEngines();

    component.noticeRocketStacks();
    component.noticeRocketStacks();
    component.exportBlueprint();

    expect(rocketToasts()).toHaveLength(1);
  });

  it("speaks again once the problems change, and after they were fixed in between", () => {
    blueprintService.blueprint.blueprintItems = twoEngines();
    component.noticeRocketStacks();

    blueprintService.blueprint.blueprintItems = [engine("CO2Engine", 0)];
    component.noticeRocketStacks();
    expect(rocketToasts()).toHaveLength(1);

    blueprintService.blueprint.blueprintItems = twoEngines();
    component.noticeRocketStacks();
    expect(rocketToasts()).toHaveLength(2);
  });

  it("follows a file export without getting in its way", () => {
    blueprintService.blueprint.blueprintItems = twoEngines();

    component.exportBlueprint();

    expect(blueprintService.exportBlueprintFile).toHaveBeenCalledWith("Rocket");
    expect(rocketToasts()).toHaveLength(1);
  });

  it("follows a share-string copy, alongside the confirmation", async () => {
    blueprintService.blueprint.blueprintItems = twoEngines();

    component.copyBlueprintText();
    await new Promise((resolve) => setTimeout(resolve));

    expect(blueprintService.copyBlueprintShareString).toHaveBeenCalled();
    expect(rocketToasts()).toHaveLength(1);
  });

  it("exports a sound rocket with no rocket notice at all", () => {
    blueprintService.blueprint.blueprintItems = [engine("CO2Engine", 0)];
    component.exportBlueprint();
    expect(blueprintService.exportBlueprintFile).toHaveBeenCalled();
    expect(rocketToasts()).toHaveLength(0);
  });
});
