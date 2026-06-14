import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { CommonModule } from "@angular/common";
import { ReactiveFormsModule } from "@angular/forms";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { MessageService } from "primeng/api";
import { DialogModule } from "primeng/dialog";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";

import { ComponentSaveDialogComponent } from "./component-save-dialog.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";

describe("ComponentSaveDialogComponent", () => {
  let component: ComponentSaveDialogComponent;
  let fixture: ComponentFixture<ComponentSaveDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ComponentSaveDialogComponent],
      imports: [
        CommonModule,
        ReactiveFormsModule,
        NoopAnimationsModule,
        RouterTestingModule.withRoutes([]),
        DialogModule,
        ButtonModule,
        InputTextModule,
      ],
      providers: [
        AuthenticationService,
        BlueprintService,
        MessageService,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentSaveDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should render save button in dialog footer when opened", async () => {
    vi.useFakeTimers();
    try {
      component.showDialog();
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(500);
      fixture.detectChanges();

      // PrimeNG dialog appends to document.body as an overlay
      const saveButton = document.body.querySelector("button[type='submit']");
      expect(saveButton).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
