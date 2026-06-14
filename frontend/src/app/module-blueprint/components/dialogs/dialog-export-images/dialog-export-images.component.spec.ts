import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";

import { DialogExportImagesComponent } from "./dialog-export-images.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";

describe("DialogExportImagesComponent", () => {
  let component: DialogExportImagesComponent;
  let fixture: ComponentFixture<DialogExportImagesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DialogExportImagesComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogExportImagesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
