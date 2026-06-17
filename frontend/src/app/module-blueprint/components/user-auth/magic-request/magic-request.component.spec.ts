import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";

import { MagicRequestComponent } from "./magic-request.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("MagicRequestComponent", () => {
  let component: MagicRequestComponent;
  let fixture: ComponentFixture<MagicRequestComponent>;
  let mockAuth: any;
  let mockRouter: any;
  let mockRoute: any;

  beforeEach(async () => {
    mockAuth = {
      sendMagicLink: vi.fn(),
      verifyMagicCode: vi.fn(),
      saveToken: vi.fn(),
    };
    mockRouter = { navigate: vi.fn() };
    mockRoute = { snapshot: { queryParams: {} } };

    await TestBed.configureTestingModule({
      declarations: [MagicRequestComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MagicRequestComponent);
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
      expect(mockAuth.sendMagicLink).not.toHaveBeenCalled();
    });

    it("sets submitted=true on success", () => {
      component.email = "a@b.com";
      mockAuth.sendMagicLink.mockReturnValue(of(undefined));
      component.submit();
      expect(component.submitted).toBe(true);
      expect(component.loading).toBe(false);
    });

    it("still sets submitted=true on error (no enumeration)", () => {
      component.email = "a@b.com";
      mockAuth.sendMagicLink.mockReturnValue(
        throwError(() => new Error("fail"))
      );
      component.submit();
      expect(component.submitted).toBe(true);
      expect(component.loading).toBe(false);
    });
  });

  describe("verifyCode", () => {
    it("does nothing when code is empty", () => {
      component.code = "";
      component.verifyCode();
      expect(mockAuth.verifyMagicCode).not.toHaveBeenCalled();
    });

    it("trims whitespace from code before sending", () => {
      component.code = "  CODE123  ";
      component.email = "a@b.com";
      mockAuth.verifyMagicCode.mockReturnValue(of({ token: "jwt" }));
      component.verifyCode();
      expect(mockAuth.verifyMagicCode).toHaveBeenCalledWith(
        "CODE123",
        "a@b.com"
      );
    });

    it("saves token and navigates to / on success", () => {
      component.code = "CODE123";
      component.email = "a@b.com";
      mockAuth.verifyMagicCode.mockReturnValue(of({ token: "magic-jwt" }));
      component.verifyCode();
      expect(mockAuth.saveToken).toHaveBeenCalledWith("magic-jwt");
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/"]);
    });

    it("sets codeError on invalid code", () => {
      component.code = "WRONG";
      component.email = "a@b.com";
      mockAuth.verifyMagicCode.mockReturnValue(
        throwError(() => new Error("expired"))
      );
      component.verifyCode();
      expect(component.codeError).toBeTruthy();
      expect(component.codeLoading).toBe(false);
    });
  });
});
