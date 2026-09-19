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
