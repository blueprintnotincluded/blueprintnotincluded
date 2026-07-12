import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { Router, ActivatedRoute } from "@angular/router";
import { of, throwError, Subject } from "rxjs";
import { MessageService } from "primeng/api";

import { LoginPageComponent } from "./login-page.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("LoginPageComponent", () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;
  let mockAuth: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockMessageService: any;

  beforeEach(async () => {
    mockAuth = {
      loginWithPassword: vi.fn(),
      saveToken: vi.fn(),
    };
    mockRouter = { navigate: vi.fn() };
    mockRoute = { snapshot: { queryParams: {} } };
    mockMessageService = { add: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [LoginPageComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MessageService, useValue: mockMessageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("shows success toast when reset query param is present", () => {
      mockRoute.snapshot.queryParams = { reset: "1" };
      component.ngOnInit();
      expect(mockMessageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "success" }),
      );
    });

    it("does not show toast when reset param is absent", () => {
      component.ngOnInit();
      expect(mockMessageService.add).not.toHaveBeenCalled();
    });
  });

  describe("submit", () => {
    it("does nothing when email is empty", () => {
      component.email = "";
      component.password = "pass";
      component.submit();
      expect(mockAuth.loginWithPassword).not.toHaveBeenCalled();
    });

    it("does nothing when password is empty", () => {
      component.email = "a@b.com";
      component.password = "";
      component.submit();
      expect(mockAuth.loginWithPassword).not.toHaveBeenCalled();
    });

    it("sets loading true while request is in flight, then false when it resolves", () => {
      component.email = "a@b.com";
      component.password = "pass";
      const response$ = new Subject<any>();
      mockAuth.loginWithPassword.mockReturnValue(response$.asObservable());

      component.submit();
      // request has not emitted yet — loading must stay true in flight
      expect(component.loading).toBe(true);

      response$.next({ kind: "success", token: "t" });
      response$.complete();
      // response handled — loading resets to false
      expect(component.loading).toBe(false);
      expect(mockAuth.saveToken).toHaveBeenCalledWith("t");
    });

    it("navigates to / on success", () => {
      component.email = "a@b.com";
      component.password = "pass";
      mockAuth.loginWithPassword.mockReturnValue(
        of({ kind: "success", token: "jwt" }),
      );
      component.submit();
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/"]);
    });

    it("shows legacy hint on legacy_account result", () => {
      component.email = "a@b.com";
      component.password = "pass";
      mockAuth.loginWithPassword.mockReturnValue(
        of({ kind: "legacy_account" }),
      );
      component.submit();
      expect(component.showLegacyHint).toBe(true);
      expect(component.loading).toBe(false);
    });

    it("sets error message on invalid_credentials result", () => {
      component.email = "a@b.com";
      component.password = "pass";
      mockAuth.loginWithPassword.mockReturnValue(
        of({ kind: "invalid_credentials" }),
      );
      component.submit();
      expect(component.errorMessage).toBeTruthy();
      expect(component.loading).toBe(false);
    });

    it("sets error message on observable error", () => {
      component.email = "a@b.com";
      component.password = "pass";
      mockAuth.loginWithPassword.mockReturnValue(
        throwError(() => new Error("network")),
      );
      component.submit();
      expect(component.errorMessage).toBeTruthy();
      expect(component.loading).toBe(false);
    });

    it("resets showLegacyHint and errorMessage on new submit", () => {
      component.showLegacyHint = true;
      component.errorMessage = "old error";
      component.email = "a@b.com";
      component.password = "pass";
      mockAuth.loginWithPassword.mockReturnValue(
        of({ kind: "success", token: "t" }),
      );
      component.submit();
      expect(component.showLegacyHint).toBe(false);
      expect(component.errorMessage).toBe("");
    });
  });

  describe("resetPassword", () => {
    it("navigates to forgot with email param", () => {
      component.email = "test@example.com";
      component.resetPassword();
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/login/forgot"], {
        queryParams: { email: "test@example.com" },
      });
    });
  });
});
