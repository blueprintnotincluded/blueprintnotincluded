import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";

import { VerifyEmailCallbackComponent } from "./verify-email-callback.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("VerifyEmailCallbackComponent", () => {
  let component: VerifyEmailCallbackComponent;
  let fixture: ComponentFixture<VerifyEmailCallbackComponent>;
  let mockAuth: any;
  let mockRouter: any;
  let mockRoute: any;

  beforeEach(async () => {
    mockAuth = {
      verifyEmail: vi.fn(),
      saveToken: vi.fn(),
    };
    mockRouter = { navigate: vi.fn() };
    mockRoute = { snapshot: { queryParams: { userId: "u123" } } };

    await TestBed.configureTestingModule({
      declarations: [VerifyEmailCallbackComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VerifyEmailCallbackComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("reads userId from query params", () => {
      component.ngOnInit();
      expect(component.userId).toBe("u123");
    });

    it("leaves userId empty when param absent", () => {
      mockRoute.snapshot.queryParams = {};
      component.ngOnInit();
      expect(component.userId).toBe("");
    });
  });

  describe("submit", () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it("does nothing when code is empty", () => {
      component.code = "";
      component.submit();
      expect(mockAuth.verifyEmail).not.toHaveBeenCalled();
    });

    it("does nothing when userId is empty", () => {
      component.userId = "";
      component.code = "valid-code";
      component.submit();
      expect(mockAuth.verifyEmail).not.toHaveBeenCalled();
    });

    it("saves token and navigates to / on success", () => {
      component.code = "code456";
      mockAuth.verifyEmail.mockReturnValue(of({ token: "jwt" }));
      component.submit();
      expect(mockAuth.verifyEmail).toHaveBeenCalledWith("code456", "u123");
      expect(mockAuth.saveToken).toHaveBeenCalledWith("jwt");
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/"]);
    });

    it("sets errorMessage on invalid/expired code", () => {
      component.code = "bad-code";
      mockAuth.verifyEmail.mockReturnValue(
        throwError(() => new Error("expired"))
      );
      component.submit();
      expect(component.errorMessage).toBeTruthy();
      expect(component.loading).toBe(false);
    });
  });
});
