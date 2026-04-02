import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { MessageService } from "primeng/api";

import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { RegisterFormComponent } from "./register-form.component";
import { CheckDuplicateService } from "src/app/module-blueprint/services/check-duplicate-service";

describe("RegisterFormComponent", () => {
  let component: RegisterFormComponent;
  let fixture: ComponentFixture<RegisterFormComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [RegisterFormComponent],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        CheckDuplicateService,
        MessageService,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RegisterFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
