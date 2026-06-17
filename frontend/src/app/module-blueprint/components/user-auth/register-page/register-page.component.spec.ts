import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";

import { RegisterPageComponent } from "./register-page.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("RegisterPageComponent", () => {
  let component: RegisterPageComponent;
  let fixture: ComponentFixture<RegisterPageComponent>;
  let mockAuth: any;
  let mockRouter: any;

  beforeEach(async () => {
    mockAuth = { registerWithPassword: vi.fn() };
    mockRouter = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [RegisterPageComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: {} } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterPageComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("submit", () => {
    it("does nothing when email is empty", () => {
      component.username = "alice";
      component.password = "pass";
      component.email = "";
      component.submit();
      expect(mockAuth.registerWithPassword).not.toHaveBeenCalled();
    });

    it("does nothing when password is empty", () => {
      component.username = "alice";
      component.email = "a@b.com";
      component.password = "";
      component.submit();
      expect(mockAuth.registerWithPassword).not.toHaveBeenCalled();
    });

    it("does nothing when username is empty", () => {
      component.username = "";
      component.email = "a@b.com";
      component.password = "pass";
      component.submit();
      expect(mockAuth.registerWithPassword).not.toHaveBeenCalled();
    });

    it("navigates to verify-email on success", () => {
      component.email = "a@b.com";
      component.password = "pass";
      component.username = "alice";
      mockAuth.registerWithPassword.mockReturnValue(
        of({ message: "ok", userId: "u1" })
      );
      component.submit();
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/auth/verify-email"], {
        queryParams: { userId: "u1" },
      });
      expect(component.loading).toBe(false);
    });

    it("sets errorMessage from server error title", () => {
      component.email = "a@b.com";
      component.password = "pass";
      component.username = "alice";
      const serverErr = {
        error: { errors: [{ title: "Email already in use" }] },
      };
      mockAuth.registerWithPassword.mockReturnValue(
        throwError(() => serverErr)
      );
      component.submit();
      expect(component.errorMessage).toBe("Email already in use");
      expect(component.loading).toBe(false);
    });

    it("sets fallback error message when server provides no title", () => {
      component.email = "a@b.com";
      component.password = "pass";
      component.username = "alice";
      mockAuth.registerWithPassword.mockReturnValue(throwError(() => ({})));
      component.submit();
      expect(component.errorMessage).toBeTruthy();
      expect(component.loading).toBe(false);
    });
  });
});
