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
  RESEARCH_TIERS,
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
  readonly researchTierOptions = RESEARCH_TIERS.map((t) => ({
    label: t,
    value: t,
  }));

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
    gameVersion: new UntypedFormControl(null),
    category: new UntypedFormControl(null),
    subcategory: new UntypedFormControl(null),
    researchTier: new UntypedFormControl(null),
    modded: new UntypedFormControl(null),
    multiplayerSafe: new UntypedFormControl(null),
  });

  get f() {
    return this.saveBlueprintForm.controls;
  }
  get isUpdate(): boolean {
    return this.blueprintService.savedBlueprint;
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
  private _originalName: string | null = null;

  constructor(
    public blueprintService: BlueprintService,
    private messageService: MessageService,
    //TODO should not be public
    public authService: AuthenticationService
  ) {}

  onSubmit() {
    this.working = true;

    const formName = this.saveBlueprintForm.value.name;
    const autoOverwrite =
      this._originalName !== null && formName === this._originalName;
    this.blueprintService.name = formName;
    this.applyMetadataToService();
    this.blueprintService.saveBlueprint(autoOverwrite).subscribe({
      next: this.handleSaveNext.bind(this),
      error: this.handleSaveError.bind(this),
    });
  }

  private applyMetadataToService() {
    const v = this.saveBlueprintForm.value;
    this.blueprintService.metadata = {
      gameVersion: v.gameVersion ?? null,
      category: v.category ?? null,
      subcategory: v.subcategory ?? null,
      description: v.description?.trim() || null,
      researchTier: v.researchTier ?? null,
      modded: v.modded ?? null,
      multiplayerSafe: v.multiplayerSafe ?? null,
    };
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
      let summary: string = $localize`${this.blueprintService.name} saved`;
      let detail: string = "";

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
        gameVersion: m.gameVersion ?? null,
        category: m.category ?? null,
        subcategory: m.subcategory ?? null,
        description: m.description ?? null,
        researchTier: m.researchTier ?? null,
        modded: m.modded ?? null,
        multiplayerSafe: m.multiplayerSafe ?? null,
      });
    }
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
      let newStyle =
        this.saveBlueprintForm.value.thumbnailType == "Color"
          ? Display.solid
          : Display.blueprint;
      if (newStyle != this.blueprintService.thumbnailStyle) {
        this.blueprintService.thumbnailStyle = newStyle;
        this.updateThumbnail.emit();
        //this.saveBlueprintForm.controls.thumbnailType.disable();
        this.intervalId = window.setInterval(
          this.updateThumbnailReady.bind(this),
          500
        );
      }
    }
  }

  reset() {
    this.working = false;
    this.thumbnailReady = false;
    this.overwrite = false;
    this._originalName = null;
    this.saveBlueprintForm.controls.name.enable();
    this.saveBlueprintForm.reset();

    // We add an interval to check the thumbnail status, because it is generated outside angular
    this.tryClearInterval();
    this.intervalId = window.setInterval(
      this.updateThumbnailReady.bind(this),
      500
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
    this.blueprintService.saveBlueprint(true).subscribe({
      next: this.handleSaveNext.bind(this),
      error: this.handleSaveError.bind(this),
    });
  }

  hideDialog() {
    this.visible = false;
  }
}
