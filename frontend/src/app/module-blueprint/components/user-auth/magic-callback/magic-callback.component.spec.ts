import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError, Subject } from "rxjs";

import { MagicCallbackComponent } from "./magic-callback.component";
import { AuthenticationService } from "../../../services/authentification-service";

describe("MagicCallbackComponent", () => {
  let component: MagicCallbackComponent;
  let fixture: ComponentFixture<MagicCallbackComponent>;
  let mockAuth: any;
  let mockRouter: any;
  let mockRoute: any;

  beforeEach(async () => {
    mockAuth = {
      verifyMagicCode: vi.fn(),
      saveToken: vi.fn(),
    };
    mockRouter = { navigate: vi.fn() };
    mockRoute = {
      snapshot: { queryParams: { code: "abc123", email: "a@b.com" } },
    };

    await TestBed.configureTestingModule({
      declarations: [MagicCallbackComponent],
      imports: [FormsModule, RouterTestingModule.withRoutes([])],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MagicCallbackComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("shows error when code is missing", () => {
      mockRoute.snapshot.queryParams = { email: "a@b.com" };
      component.ngOnInit();
      expect(component.loading).toBe(false);
      expect(component.errorMessage).toBeTruthy();
      expect(mockAuth.verifyMagicCode).not.toHaveBeenCalled();
    });

    it("shows error when email is missing", () => {
      mockRoute.snapshot.queryParams = { code: "abc123" };
      component.ngOnInit();
      expect(component.loading).toBe(false);
      expect(component.errorMessage).toBeTruthy();
      expect(mockAuth.verifyMagicCode).not.toHaveBeenCalled();
    });

    it("saves token and navigates to / on success", () => {
      mockAuth.verifyMagicCode.mockReturnValue(of({ token: "magic-jwt" }));
      component.ngOnInit();
      expect(mockAuth.verifyMagicCode).toHaveBeenCalledWith(
        "abc123",
        "a@b.com"
      );
      expect(mockAuth.saveToken).toHaveBeenCalledWith("magic-jwt");
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/"]);
    });

    it("sets errorMessage on expired/used link", () => {
      mockAuth.verifyMagicCode.mockReturnValue(
        throwError(() => new Error("expired"))
      );
      component.ngOnInit();
      expect(component.loading).toBe(false);
      expect(component.errorMessage).toBeTruthy();
    });

    it("keeps loading=true while verifyMagicCode is in flight", () => {
      const response$ = new Subject<any>();
      mockAuth.verifyMagicCode.mockReturnValue(response$.asObservable());

      component.ngOnInit();
      // request has not emitted yet — loading must stay true in flight
      expect(mockAuth.verifyMagicCode).toHaveBeenCalledWith(
        "abc123",
        "a@b.com"
      );
      expect(component.loading).toBe(true);
      expect(component.errorMessage).toBe("");
    });
  });
});
