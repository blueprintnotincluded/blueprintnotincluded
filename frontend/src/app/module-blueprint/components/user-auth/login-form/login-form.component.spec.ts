import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule, FormsModule } from "@angular/forms";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { MessageService } from "primeng/api";
import { of, throwError } from "rxjs";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";

import { LoginFormComponent } from "./login-form.component";
import { AuthenticationService } from "../../../services/authentification-service";
import { UsernameValidationDirective } from "src/app/module-blueprint/directives/username-validation.directive";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

describe("LoginFormComponent", () => {
  let component: LoginFormComponent;
  let fixture: ComponentFixture<LoginFormComponent>;
  let mockAuthService: jasmine.SpyObj<AuthenticationService>;
  let mockMessageService: jasmine.SpyObj<MessageService>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj("AuthenticationService", [
      "login",
      "getUserDetails",
      "requestPasswordReset",
    ]);
    const messageServiceSpy = jasmine.createSpyObj("MessageService", ["add"]);

    // Set up default return values
    authServiceSpy.getUserDetails.and.returnValue({ username: "testuser" });
    authServiceSpy.requestPasswordReset.and.returnValue(of({}));
    authServiceSpy.login.and.returnValue(of({ token: "mock-token" }));

    await TestBed.configureTestingModule({
      declarations: [LoginFormComponent, UsernameValidationDirective],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [ReactiveFormsModule, FormsModule, RouterTestingModule],
      providers: [
        { provide: AuthenticationService, useValue: authServiceSpy },
        { provide: MessageService, useValue: messageServiceSpy },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginFormComponent);
    component = fixture.componentInstance;
    mockAuthService = TestBed.inject(
      AuthenticationService
    ) as jasmine.SpyObj<AuthenticationService>;
    mockMessageService = TestBed.inject(
      MessageService
    ) as jasmine.SpyObj<MessageService>;
  });

  afterEach(() => {
    // Clean up any subscriptions
    if (component.subscription) {
      component.subscription.unsubscribe();
    }
    if (component.loginSubscription) {
      component.loginSubscription.unsubscribe();
    }
    if (component.resetSubscription) {
      component.resetSubscription.unsubscribe();
    }
    if (component.passwordResetSubscription) {
      component.passwordResetSubscription.unsubscribe();
    }
    // Call ngOnDestroy to ensure all cleanup
    component.ngOnDestroy();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should initialize form with empty values", () => {
    expect(component.loginForm.get("username")?.value).toBe("");
    expect(component.loginForm.get("password")?.value).toBe("");
  });

  it("should have required validators on form controls", () => {
    const usernameControl = component.loginForm.get("username");
    const passwordControl = component.loginForm.get("password");

    expect(usernameControl?.hasError("required")).toBeTruthy();
    expect(passwordControl?.hasError("required")).toBeTruthy();
  });

  it("should validate username format", () => {
    const usernameControl = component.loginForm.get("username");

    // Test invalid username
    usernameControl?.setValue("invalid@username");
    expect(usernameControl?.invalid).toBeTruthy();

    // Test valid username
    usernameControl?.setValue("validusername123");
    expect(usernameControl?.valid).toBeTruthy();
  });

  it("should handle successful login", () => {
    const mockLoginResponse = { token: "mock-jwt-token" };

    mockAuthService.login.and.returnValue(of(mockLoginResponse));

    spyOn(component.loginOk, "emit");

    component.loginForm.patchValue({
      username: "testuser",
      password: "testpassword",
    });

    component.onSubmit();

    expect(mockAuthService.login).toHaveBeenCalledWith({
      email: "",
      username: "testuser",
      password: "testpassword",
    });
    expect(component.loginOk.emit).toHaveBeenCalled();
  });

  it("should handle login failure", () => {
    const mockError = { error: "Invalid credentials" };

    mockAuthService.login.and.returnValue(throwError(() => mockError));

    component.loginForm.patchValue({
      username: "testuser",
      password: "wrongpassword",
    });

    component.onSubmit();

    expect(component.authError).toBe(true);
    expect(component.working).toBe(false);
  });

  it("should reset form correctly", () => {
    component.loginForm.patchValue({
      username: "testuser",
      password: "testpassword",
    });

    component.reset();

    expect(component.loginForm.get("username")?.value).toBe(null);
    expect(component.loginForm.get("password")?.value).toBe(null);
  });

  it("should submit with valid form", () => {
    component.loginForm.patchValue({
      username: "validuser",
      password: "validpassword",
    });

    component.onSubmit();

    expect(mockAuthService.login).toHaveBeenCalledWith({
      email: "",
      username: "validuser",
      password: "validpassword",
    });
  });
});
