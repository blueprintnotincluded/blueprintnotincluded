import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";

import { ResetPasswordComponent } from "./reset-password.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("ResetPasswordComponent", () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockAuth: any;
  let mockRouter: any;
  let mockRoute: any;

  beforeEach(async () => {
    mockAuth = { resetPasswordWithToken: vi.fn() };
    mockRouter = { navigate: vi.fn() };
    mockRoute = { snapshot: { queryParams: { token: "valid-token" } } };

    await TestBed.configureTestingModule({
      declarations: [ResetPasswordComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("sets token from query param", () => {
      component.ngOnInit();
      expect(component.token).toBe("valid-token");
      expect(component.tokenError).toBe(false);
    });

    it("sets tokenError when no token param", () => {
      mockRoute.snapshot.queryParams = {};
      component.ngOnInit();
      expect(component.token).toBe("");
      expect(component.tokenError).toBe(true);
      expect(component.errorMessage).toBeTruthy();
    });
  });

  describe("submit", () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it("does nothing when newPassword is empty", () => {
      component.newPassword = "";
      component.confirmPassword = "pass";
      component.submit();
      expect(mockAuth.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("does nothing when confirmPassword is empty", () => {
      component.newPassword = "pass";
      component.confirmPassword = "";
      component.submit();
      expect(mockAuth.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("sets errorMessage when passwords do not match", () => {
      component.newPassword = "pass1";
      component.confirmPassword = "pass2";
      component.submit();
      expect(component.errorMessage).toContain("match");
      expect(mockAuth.resetPasswordWithToken).not.toHaveBeenCalled();
    });

    it("navigates to login with reset param on success", () => {
      component.newPassword = "newpass";
      component.confirmPassword = "newpass";
      mockAuth.resetPasswordWithToken.mockReturnValue(of(undefined));
      component.submit();
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/login"], {
        queryParams: { reset: 1 },
      });
    });

    it("sets tokenError on non-422 error", () => {
      component.newPassword = "newpass";
      component.confirmPassword = "newpass";
      mockAuth.resetPasswordWithToken.mockReturnValue(
        throwError(() => ({ status: 401, error: {} })),
      );
      component.submit();
      expect(component.tokenError).toBe(true);
      expect(component.errorMessage).toBeTruthy();
    });

    it("keeps tokenError false on 422 (password policy violation)", () => {
      component.newPassword = "weak";
      component.confirmPassword = "weak";
      const err = {
        status: 422,
        error: { errors: [{ title: "Too short" }] },
      };
      mockAuth.resetPasswordWithToken.mockReturnValue(throwError(() => err));
      component.submit();
      expect(component.tokenError).toBe(false);
      expect(component.errorMessage).toBe("Too short");
    });
  });
});
