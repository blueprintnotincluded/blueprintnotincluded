import { Component, Output, EventEmitter } from "@angular/core";
import {
  UntypedFormGroup,
  UntypedFormControl,
  Validators,
} from "@angular/forms";
import { BlueprintService } from "../../../services/blueprint-service";
import { MessageService } from "primeng/api";
import { AuthenticationService } from "../../../services/authentification-service";
import { BlueprintNameValidationDirective } from "src/app/module-blueprint/directives/blueprint-name-validation.directive";
import {
  Display,
  GAME_VERSIONS,
  CATEGORIES,
  SUBCATEGORIES,
  OniItem,
  deriveGameVersion,
  deriveModded,
  deriveCategory,
  buildCategoryLookup,
  BuildMenuCategory,
  BuildMenuItem,
  CategoryLookup,
} from "../../../../../../../lib/index";

@Component({
  selector: "app-component-save-dialog",
  templateUrl: "./component-save-dialog.component.html",
  styleUrls: ["./component-save-dialog.component.css"],
  standalone: false,
})
export class ComponentSaveDialogComponent {
  visible: boolean = false;

  @Output() updateThumbnail = new EventEmitter();

  readonly gameVersionOptions = GAME_VERSIONS.map((v) => ({
    label: v,
    value: v,
  }));
  readonly categoryOptions = CATEGORIES.map((c) => ({ label: c, value: c }));

  get subcategoryOptions(): { label: string; value: string }[] {
    const cat = this.saveBlueprintForm.value.category;
    if (!cat) return [];
    const subs = SUBCATEGORIES[cat as keyof typeof SUBCATEGORIES] ?? [];
    return (subs as readonly string[]).map((s) => ({ label: s, value: s }));
  }

  onCategoryChange() {
    this.saveBlueprintForm.patchValue({ subcategory: null });
  }

  saveBlueprintForm = new UntypedFormGroup({
    thumbnailType: new UntypedFormControl("Color", [Validators.required]),
    name: new UntypedFormControl("", [
      Validators.required,
      BlueprintNameValidationDirective.validateBlueprintName,
    ]),
    description: new UntypedFormControl(null),
    gameVersion: new UntypedFormControl({ value: null, disabled: true }),
    category: new UntypedFormControl(null),
    subcategory: new UntypedFormControl(null),
    modded: new UntypedFormControl({ value: null, disabled: true }),
  });

  get f() {
    return this.saveBlueprintForm.controls;
  }
  get isUpdate(): boolean {
    return this.blueprintService.savedBlueprint;
  }
  get isDraft(): boolean {
    return this.blueprintService.isPublished === false;
  }

  get dialogHeader(): string {
    return this.isUpdate
      ? $localize`:dialogHeader:Update blueprint`
      : $localize`:dialogHeader:Save blueprint to the cloud`;
  }

  get icon() {
    return this.working || this.blueprintService.thumbnail == null
      ? "pi pi-spin pi-spinner"
      : "";
  }
  get saveLabel() {
    if (this.isUpdate) return $localize`:saveLabel:Update`;
    return this.blueprintService.thumbnail == null
      ? $localize`:saveLabel:Generating thumbnail`
      : $localize`:saveLabel:Save`;
  }
  // The fun path: publish right from the save dialog
  get publishLabel() {
    if (this.blueprintService.thumbnail == null)
      return $localize`:saveLabel:Generating thumbnail`;
    return this.isUpdate
      ? $localize`:publishLabel:Update & Publish`
      : $localize`:publishLabel:Save & Publish`;
  }
  get draftLabel() {
    return this.isUpdate
      ? $localize`:saveLabel:Update`
      : $localize`:draftLabel:Save as draft`;
  }
  get disabledSaveButton() {
    return (
      !this.saveBlueprintForm.valid ||
      this.saveBlueprintForm.pending ||
      this.working ||
      !this.authService.isLoggedIn() ||
      this.blueprintService.thumbnail == null
    );
  }

  working: boolean = false;
  thumbnailReady: boolean = false;
  overwrite: boolean = false;
  // Publish intent for the in-flight save: true = publish with this save,
  // false/null = keep as draft / keep current state. Reused by the
  // overwrite-confirm flow so "Yes" honors the originally clicked button.
  pendingPublish: boolean | null = null;
  private _originalName: string | null = null;
  private _categoryLookup: CategoryLookup | null = null;

  constructor(
    public blueprintService: BlueprintService,
    private messageService: MessageService,
    //TODO should not be public
    public authService: AuthenticationService,
  ) {}

  // Enter key / form submit triggers the primary action: publish for a new
  // save or a draft update, plain update for an already-published blueprint
  onSubmit() {
    this.submit(!this.isUpdate || this.isDraft ? true : null);
  }

  submit(publish: boolean | null) {
    this.pendingPublish = publish;
    this.working = true;

    const formName = this.saveBlueprintForm.value.name;
    const autoOverwrite =
      this._originalName !== null && formName === this._originalName;
    this.blueprintService.name = formName;
    this.applyMetadataToService();
    this.blueprintService
      .saveBlueprint(autoOverwrite, publish ?? undefined)
      .subscribe({
        next: this.handleSaveNext.bind(this),
        error: this.handleSaveError.bind(this),
      });
  }

  private applyMetadataToService() {
    const v = this.saveBlueprintForm.getRawValue();
    this.blueprintService.metadata = {
      gameVersion: v.gameVersion ?? null,
      category: v.category ?? null,
      subcategory: v.subcategory ?? null,
      description: v.description?.trim() || null,
      modded: v.modded ?? null,
    };
  }

  // Derives gameVersion and modded from the current blueprint content and
  // patches the disabled form controls so users see what was computed.
  private computeDerivedMetadata() {
    const blueprint = this.blueprintService.blueprint;
    // oniItemsMap may be null in unit tests before the database loads
    if (!OniItem.oniItemsMap) return;

    const buildingDlcIds = blueprint.blueprintItems.map(
      (item) => item.oniItem.dlcIds,
    );
    const gameVersion = deriveGameVersion(buildingDlcIds);

    const knownIds = new Set(OniItem.oniItems.map((i) => i.id));
    const mdbBlueprint = blueprint.toMdbBlueprint();
    const prefabIds = mdbBlueprint.blueprintItems.map((b) => b.id);
    const modded =
      blueprint.hadUnknownBuildings || deriveModded(prefabIds, knownIds);

    this.saveBlueprintForm.patchValue({ gameVersion, modded });

    // Pre-fill category only when the control is empty: a fresh save gets
    // the suggestion, but the update flow in showDialog() restores the
    // blueprint's stored category first and must not be clobbered here.
    if (
      !this.saveBlueprintForm.value.category &&
      BuildMenuCategory.buildMenuCategories != null &&
      BuildMenuItem.buildMenuItems != null
    ) {
      this._categoryLookup ??= buildCategoryLookup(
        BuildMenuCategory.buildMenuCategories,
        BuildMenuItem.buildMenuItems,
      );
      const category = deriveCategory(prefabIds, this._categoryLookup);
      if (category != null) this.saveBlueprintForm.patchValue({ category });
    }
  }

  // TODO this is ugly, use pipe map instead
  public id!: string;
  handleSaveNext(response: any) {
    if (response.overwrite) {
      this.overwrite = true;
      this.saveBlueprintForm.controls.name.disable();
      this.working = false;
    } else {
      this.hideDialog();

      // TODO move this to the service ?
      let summary: string;
      if (this.pendingPublish === true) {
        summary = $localize`${this.blueprintService.name} published! It's now visible to everyone`;
      } else if (this.blueprintService.isPublished === false) {
        summary = $localize`${this.blueprintService.name} saved as draft`;
      } else {
        summary = $localize`${this.blueprintService.name} saved`;
      }
      const detail: string = "";

      this.messageService.add({
        severity: "success",
        summary: summary,
        detail: detail,
      });
      this.working = false;
    }
  }

  handleSaveError() {
    this.hideDialog();
    this.messageService.add({
      severity: "error",
      summary: $localize`Error saving blueprint`,
    });
    this.working = false;
  }

  intervalId!: number;
  showDialog() {
    this.reset();
    this.visible = true;

    this.saveBlueprintForm.patchValue({ thumbnailType: "Color" });
    if (this.blueprintService.name != null && this.blueprintService.name != "")
      this.saveBlueprintForm.patchValue({ name: this.blueprintService.name });

    if (this.isUpdate) {
      this._originalName = this.blueprintService.name ?? null;
      const m = this.blueprintService.metadata;
      this.saveBlueprintForm.patchValue({
        category: m.category ?? null,
        subcategory: m.subcategory ?? null,
        description: m.description ?? null,
      });
    }

    this.computeDerivedMetadata();
  }

  tryClearInterval() {
    if (this.intervalId != null) window.clearInterval(this.intervalId);
    this.intervalId = null as any;
  }

  updateThumbnailReady() {
    //console.log('updateThumbnailReady');
    this.thumbnailReady = this.blueprintService.thumbnail != null;

    if (this.thumbnailReady) {
      //this.saveBlueprintForm.controls.thumbnailType.enable();
      this.tryClearInterval();
    }
  }

  changeThumbnail() {
    if (this.saveBlueprintForm.value.thumbnailType != null) {
      const newStyle =
        this.saveBlueprintForm.value.thumbnailType == "Color"
          ? Display.solid
          : Display.blueprint;
      if (newStyle != this.blueprintService.thumbnailStyle) {
        this.blueprintService.thumbnailStyle = newStyle;
        this.updateThumbnail.emit();
        //this.saveBlueprintForm.controls.thumbnailType.disable();
        this.intervalId = window.setInterval(
          this.updateThumbnailReady.bind(this),
          500,
        );
      }
    }
  }

  reset() {
    this.working = false;
    this.thumbnailReady = false;
    this.overwrite = false;
    this.pendingPublish = null;
    this._originalName = null;
    this.saveBlueprintForm.controls.name.enable();
    this.saveBlueprintForm.reset();

    // We add an interval to check the thumbnail status, because it is generated outside angular
    this.tryClearInterval();
    this.intervalId = window.setInterval(
      this.updateThumbnailReady.bind(this),
      500,
    );
  }

  doNotOverwrite() {
    this.overwrite = false;
    this.saveBlueprintForm.controls.name.enable();
  }

  doOverwrite() {
    this.working = true;

    this.blueprintService.name = this.saveBlueprintForm.getRawValue().name; // Use get raw Value because it can be disabled
    this.applyMetadataToService();
    this.blueprintService
      .saveBlueprint(true, this.pendingPublish ?? undefined)
      .subscribe({
        next: this.handleSaveNext.bind(this),
        error: this.handleSaveError.bind(this),
      });
  }

  hideDialog() {
    this.visible = false;
  }
}
