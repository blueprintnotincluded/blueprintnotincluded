import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { MessageService } from "primeng/api";

import { DialogShareUrlComponent } from "./dialog-share-url.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";

describe("DialogShareUrlComponent", () => {
  let component: DialogShareUrlComponent;
  let fixture: ComponentFixture<DialogShareUrlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DialogShareUrlComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        MessageService,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogShareUrlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
