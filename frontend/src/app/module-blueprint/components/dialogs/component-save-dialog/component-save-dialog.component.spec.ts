import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
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
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { Textarea } from "primeng/textarea";

import { ComponentSaveDialogComponent } from "./component-save-dialog.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { of } from "rxjs";

describe("ComponentSaveDialogComponent", () => {
  let component: ComponentSaveDialogComponent;
  let fixture: ComponentFixture<ComponentSaveDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ComponentSaveDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [
        CommonModule,
        ReactiveFormsModule,
        NoopAnimationsModule,
        RouterTestingModule.withRoutes([]),
        DialogModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        CheckboxModule,
        Textarea,
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

  describe("metadata optional fields", () => {
    it("form initialises with null metadata fields", () => {
      expect(component.saveBlueprintForm.value.gameVersion).toBeNull();
      expect(component.saveBlueprintForm.value.category).toBeNull();
      expect(component.saveBlueprintForm.value.subcategory).toBeNull();
      expect(component.saveBlueprintForm.value.description).toBeNull();
      expect(component.saveBlueprintForm.value.researchTier).toBeNull();
      expect(component.saveBlueprintForm.value.modded).toBeNull();
      expect(component.saveBlueprintForm.value.multiplayerSafe).toBeNull();
    });

    it("subcategoryOptions is empty when no category selected", () => {
      component.saveBlueprintForm.patchValue({ category: null });
      expect(component.subcategoryOptions).toHaveLength(0);
    });

    it("subcategoryOptions is non-empty for a valid category", () => {
      component.saveBlueprintForm.patchValue({ category: "power" });
      expect(component.subcategoryOptions.length).toBeGreaterThan(0);
    });

    it("onCategoryChange clears subcategory", () => {
      component.saveBlueprintForm.patchValue({
        category: "power",
        subcategory: "generator",
      });
      component.onCategoryChange();
      expect(component.saveBlueprintForm.value.subcategory).toBeNull();
    });

    it("applyMetadataToService writes metadata to blueprintService", () => {
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.saveBlueprint = vi
        .fn()
        .mockReturnValue(of({ id: "abc" }));

      component.saveBlueprintForm.patchValue({
        name: "Test Blueprint",
        gameVersion: "spacedOut",
        category: "power",
        subcategory: "generator",
        description: "A power setup",
        researchTier: "advanced",
        modded: true,
        multiplayerSafe: false,
      });
      // Simulate thumbnail ready to allow submit
      (blueprintService as any).thumbnail = "data:image/png;base64,test";

      component.onSubmit();

      expect(blueprintService.metadata).toMatchObject({
        gameVersion: "spacedOut",
        category: "power",
        subcategory: "generator",
        description: "A power setup",
        researchTier: "advanced",
        modded: true,
        multiplayerSafe: false,
      });
    });
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
