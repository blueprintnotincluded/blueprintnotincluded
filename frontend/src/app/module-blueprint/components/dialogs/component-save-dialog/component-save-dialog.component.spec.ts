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
        true,
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
        false,
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

  describe("computeDerivedMetadata DLC requirements", () => {
    afterEach(() => {
      (OniItem as any).oniItemsMap = undefined;
    });

    function fakeBlueprint(buildingDlcIds: string[][]) {
      return {
        blueprintItems: buildingDlcIds.map((dlcIds) => ({
          oniItem: { dlcIds },
        })),
        hadUnknownBuildings: false,
        toMdbBlueprint: () => ({
          blueprintItems: buildingDlcIds.map((_, i) => ({ id: `Fake${i}` })),
        }),
      } as any;
    }

    function showWith(buildingDlcIds: string[][]) {
      OniItem.oniItemsMap = new Map([["Fake0", { id: "Fake0" } as any]]);
      TestBed.inject(BlueprintService).blueprint =
        fakeBlueprint(buildingDlcIds);
      component.showDialog();
    }

    it("derives the union of every placed building's packs", () => {
      showWith([["DLC3_ID"], ["DLC2_ID"], ["DLC3_ID"]]);
      expect(component.requiredDlcs).toEqual(["DLC2_ID", "DLC3_ID"]);
    });

    it("derives [] for a base-game-only blueprint", () => {
      showWith([[], []]);
      expect(component.requiredDlcs).toEqual([]);
    });

    it("renders labelled chips, or Base game for an empty set", () => {
      showWith([["DLC2_ID"]]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(
        "The Frosty Planet Pack",
      );
      expect(fixture.nativeElement.textContent).not.toContain("DLC2_ID");

      showWith([[]]);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("Base game");
    });
  });

  describe("computeDerivedMetadata modded detection", () => {
    afterEach(() => {
      (OniItem as any).oniItemsMap = undefined;
      (BuildMenuCategory as any).buildMenuCategories = undefined;
      (BuildMenuItem as any).buildMenuItems = undefined;
    });

    // Mirrors loadFakeDatabase() above, plus one known-mod building so
    // deriveModded's mod leg has something to match against. `id` must be
    // set on each fake OniItem: computeDerivedMetadata builds knownIds from
    // OniItem.oniItems.map(i => i.id), so an id-less mock would make every
    // real prefab look "unknown" and always derive modded: true.
    function loadFakeDatabaseWithMod() {
      OniItem.oniItemsMap = new Map([
        ["Electrolyzer", { id: "Electrolyzer" } as any],
        ["PAirlockDoor", { id: "PAirlockDoor", mod: "2094698134" } as any],
      ]);
      BuildMenuCategory.buildMenuCategories = [];
      BuildMenuItem.buildMenuItems = [];
    }

    function fakeBlueprint(prefabIds: string[]) {
      return {
        blueprintItems: prefabIds.map(() => ({ oniItem: { dlcIds: [] } })),
        hadUnknownBuildings: false,
        toMdbBlueprint: () => ({
          blueprintItems: prefabIds.map((id) => ({ id })),
        }),
      } as any;
    }

    it("derives modded: true when the blueprint contains a known-mod building", () => {
      loadFakeDatabaseWithMod();
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.blueprint = fakeBlueprint(["PAirlockDoor"]);

      component.showDialog();

      // modded is a disabled control — disabled controls are excluded from
      // FormGroup.value, so read it directly off the control.
      expect(component.saveBlueprintForm.controls.modded.value).toBe(true);
    });

    it("derives modded: false for a vanilla-only blueprint", () => {
      loadFakeDatabaseWithMod();
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.blueprint = fakeBlueprint(["Electrolyzer"]);

      component.showDialog();

      expect(component.saveBlueprintForm.controls.modded.value).toBe(false);
    });
  });

  it("renders Save & Publish and Save as draft buttons on a first save", async () => {
    vi.useFakeTimers();
    try {
      // Without a thumbnail the publish label reads "Generating thumbnail"
      (TestBed.inject(BlueprintService) as any).thumbnail =
        "data:image/png;base64,test";
      component.showDialog();
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(500);
      fixture.detectChanges();

      // PrimeNG dialog appends to document.body as an overlay
      const publishButton = document.body.querySelector(
        ".save-action--publish",
      );
      const draftButton = document.body.querySelector(".save-action--draft");
      expect(publishButton).not.toBeNull();
      expect(draftButton).not.toBeNull();
      expect(publishButton!.textContent).toContain("Publish");
      expect(draftButton!.textContent).toContain("draft");
    } finally {
      vi.useRealTimers();
    }
  });

  describe("publish intent", () => {
    function readyService() {
      const blueprintService = TestBed.inject(BlueprintService);
      blueprintService.saveBlueprint = vi
        .fn()
        .mockReturnValue(of({ id: "abc" }));
      (blueprintService as any).thumbnail = "data:image/png;base64,test";
      component.saveBlueprintForm.patchValue({ name: "Test Blueprint" });
      return blueprintService;
    }

    it("submit(true) saves with publish", () => {
      const blueprintService = readyService();

      component.submit(true);

      expect(blueprintService.saveBlueprint).toHaveBeenCalledWith(false, true);
      expect(component.pendingPublish).toBe(true);
    });

    it("submit(false) saves as draft", () => {
      const blueprintService = readyService();

      component.submit(false);

      expect(blueprintService.saveBlueprint).toHaveBeenCalledWith(false, false);
    });

    it("submit(null) keeps the current publish state (plain update)", () => {
      const blueprintService = readyService();

      component.submit(null);

      expect(blueprintService.saveBlueprint).toHaveBeenCalledWith(
        false,
        undefined,
      );
    });

    it("form submit (Enter) publishes on a first save", () => {
      const blueprintService = readyService();

      component.onSubmit();

      expect(blueprintService.saveBlueprint).toHaveBeenCalledWith(false, true);
    });

    it("form submit keeps state on an update of a published blueprint", () => {
      const blueprintService = readyService();
      blueprintService.id = "existing-id"; // isUpdate = true
      blueprintService.isPublished = true;

      component.onSubmit();

      expect(blueprintService.saveBlueprint).toHaveBeenCalledWith(
        false,
        undefined,
      );
    });

    it("doOverwrite reuses the publish intent from the originally clicked button", () => {
      const blueprintService = readyService();
      component.pendingPublish = true;

      component.doOverwrite();

      expect(blueprintService.saveBlueprint).toHaveBeenCalledWith(true, true);
    });

    it("reset clears the pending publish intent", () => {
      component.pendingPublish = true;
      component.reset();
      expect(component.pendingPublish).toBeNull();
    });
  });
});
