import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute } from "@angular/router";
import { of, throwError } from "rxjs";

import { ForgotPasswordComponent } from "./forgot-password.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("ForgotPasswordComponent", () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockAuth: any;
  let mockRoute: any;

  beforeEach(async () => {
    mockAuth = { forgotPassword: vi.fn() };
    mockRoute = { snapshot: { queryParams: {} } };

    await TestBed.configureTestingModule({
      declarations: [ForgotPasswordComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("pre-fills email from query param", () => {
      mockRoute.snapshot.queryParams = { email: "pre@fill.com" };
      component.ngOnInit();
      expect(component.email).toBe("pre@fill.com");
    });

    it("leaves email empty when no query param", () => {
      component.ngOnInit();
      expect(component.email).toBe("");
    });
  });

  describe("submit", () => {
    it("does nothing when email is empty", () => {
      component.email = "";
      component.submit();
      expect(mockAuth.forgotPassword).not.toHaveBeenCalled();
    });

    it("sets submitted=true on success", () => {
      component.email = "a@b.com";
      mockAuth.forgotPassword.mockReturnValue(of(undefined));
      component.submit();
      expect(component.submitted).toBe(true);
      expect(component.loading).toBe(false);
    });

    it("still sets submitted=true on error (no enumeration)", () => {
      component.email = "a@b.com";
      mockAuth.forgotPassword.mockReturnValue(
        throwError(() => new Error("fail")),
      );
      component.submit();
      expect(component.submitted).toBe(true);
      expect(component.loading).toBe(false);
    });

    it("sets loading=true before request", () => {
      component.email = "a@b.com";
      let loadingDuringCall = false;
      mockAuth.forgotPassword.mockImplementation(() => {
        loadingDuringCall = component.loading;
        return of(undefined);
      });
      component.submit();
      expect(loadingDuringCall).toBe(true);
    });
  });
});
