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
import {
  OniItem,
  BuildMenuCategory,
  BuildMenuItem,
} from "../../../../../../../lib/index";

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
    it("form initialises with null editable metadata fields", () => {
      expect(component.saveBlueprintForm.value.category).toBeNull();
      expect(component.saveBlueprintForm.value.subcategory).toBeNull();
      expect(component.saveBlueprintForm.value.description).toBeNull();
    });

    it("gameVersion and modded controls are disabled (auto-detected)", () => {
      expect(component.saveBlueprintForm.controls.gameVersion.disabled).toBe(
        true
      );
      expect(component.saveBlueprintForm.controls.modded.disabled).toBe(true);
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
        category: "power",
        subcategory: "generator",
        description: "A power setup",
      });
      // gameVersion and modded are disabled — patch via the control
      component.saveBlueprintForm.controls.gameVersion.setValue("spacedOut");
      component.saveBlueprintForm.controls.modded.setValue(true);
      // Simulate thumbnail ready to allow submit
      (blueprintService as any).thumbnail = "data:image/png;base64,test";

      component.onSubmit();

      expect(blueprintService.metadata).toMatchObject({
        gameVersion: "spacedOut",
        category: "power",
        subcategory: "generator",
        description: "A power setup",
        modded: true,
      });
    });
  });

  describe("computeDerivedMetadata category pre-fill", () => {
    afterEach(() => {
      (OniItem as any).oniItemsMap = undefined;
      (BuildMenuCategory as any).buildMenuCategories = undefined;
      (BuildMenuItem as any).buildMenuItems = undefined;
    });

    function loadFakeDatabase() {
      OniItem.oniItemsMap = new Map([["Electrolyzer", {} as any]]);
      BuildMenuCategory.buildMenuCategories = [
        { category: 1, categoryName: "oxygen" } as any,
      ];
      BuildMenuItem.buildMenuItems = [
        { category: 1, buildingId: "Electrolyzer" } as any,
      ];
    }

    // Avoids constructing a real Blueprint/BlueprintItem (which would pull in
    // PIXI) — computeDerivedMetadata only reads oniItem.dlcIds and the
    // toMdbBlueprint() prefab ids.
    function fakeBlueprint(prefabIds: string[]) {
      return {
        blueprintItems: prefabIds.map(() => ({ oniItem: { dlcIds: [] } })),
        hadUnknownBuildings: false,
        toMdbBlueprint: () => ({
          blueprintItems: prefabIds.map((id) => ({ id })),
        }),
      } as any;
    }

    it("pre-fills category on a fresh save from blueprint content", () => {
      loadFakeDatabase();
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.blueprint = fakeBlueprint(["Electrolyzer"]);

      component.showDialog();

      expect(component.saveBlueprintForm.value.category).toBe("oxygenGen");
    });

    it("does not clobber a stored category on update", () => {
      loadFakeDatabase();
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.blueprint = fakeBlueprint(["Electrolyzer"]);
      blueprintService.id = "existing-id"; // savedBlueprint / isUpdate = true
      blueprintService.metadata = { category: "power" };

      component.showDialog();

      expect(component.saveBlueprintForm.value.category).toBe("power");
    });

    it("category control stays enabled after pre-fill", () => {
      loadFakeDatabase();
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.blueprint = fakeBlueprint(["Electrolyzer"]);

      component.showDialog();

      expect(component.saveBlueprintForm.controls.category.disabled).toBe(
        false
      );
    });

    it("leaves category null when there is no signal", () => {
      loadFakeDatabase();
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.blueprint = fakeBlueprint([]);

      component.showDialog();

      expect(component.saveBlueprintForm.value.category).toBeNull();
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
