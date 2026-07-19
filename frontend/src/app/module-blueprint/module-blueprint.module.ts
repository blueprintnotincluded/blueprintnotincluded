import { NgModule } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterModule } from "@angular/router";
import { ComponentCanvasComponent } from "src/app/module-blueprint/components/component-canvas/component-canvas.component";
import { ComponentMenuComponent } from "src/app/module-blueprint/components/component-menu/component-menu.component";
import { UserMenuComponent } from "./components/user-menu/user-menu.component";
import { SiteNavComponent } from "./components/site-nav/site-nav.component";
import { ComponentBlueprintParentComponent } from "src/app/module-blueprint/components/component-blueprint-parent/component-blueprint-parent.component";

import { MouseWheelDirective } from "src/app/module-blueprint/directives/mousewheel.directive";
import { DragAndDropDirective } from "src/app/module-blueprint/directives/draganddrop.directive";

import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { ScrollPanelModule } from "primeng/scrollpanel";
import { PopoverModule } from "primeng/popover";
import { MenubarModule } from "primeng/menubar";
import { MenuModule } from "primeng/menu";
import { TabsModule } from "primeng/tabs";
import { DialogModule } from "primeng/dialog";
import { SelectModule } from "primeng/select";
import { AccordionModule } from "primeng/accordion";
import { SliderModule } from "primeng/slider";
import { ToastModule } from "primeng/toast";
import { InputTextModule } from "primeng/inputtext";
import { ColorPickerModule } from "primeng/colorpicker";
import { PasswordModule } from "primeng/password";
import { TooltipModule } from "primeng/tooltip";
import { MessageService } from "primeng/api";
import { PanelModule } from "primeng/panel";
import { CheckboxModule } from "primeng/checkbox";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { FieldsetModule } from "primeng/fieldset";
import { ListboxModule } from "primeng/listbox";
import { ToggleButtonModule } from "primeng/togglebutton";
import { DrawerModule } from "primeng/drawer";
import { RadioButtonModule } from "primeng/radiobutton";
import { Textarea } from "primeng/textarea";
import { UsernameValidationDirective } from "./directives/username-validation.directive";
import { ComponentSideSelectionToolComponent } from "./components/side-bar/selection-tool/selection-tool.component";
import { KeyboardDirective } from "./directives/keyboard.directive";
import { AuthenticationService } from "./services/authentification-service";
import { BlueprintService } from "./services/blueprint-service";
import { ToolService } from "./services/tool-service";
import { SelectTool } from "./common/tools/select-tool";
import { BuildTool } from "./common/tools/build-tool";
import { ScissorsTool } from "./common/tools/scissors-tool";
import { ComponentSaveDialogComponent } from "./components/dialogs/component-save-dialog/component-save-dialog.component";
import { DialogShareUrlComponent } from "./components/dialogs/dialog-share-url/dialog-share-url.component";
import { DialogImportStringComponent } from "./components/dialogs/dialog-import-string/dialog-import-string.component";
import { ComponentSideBuildToolComponent } from "./components/side-bar/build-tool/build-tool.component";
import { ItemCollectionInfoComponent } from "./components/side-bar/item-collection-info/item-collection-info.component";
import { DialogBrowseComponent } from "./components/dialogs/dialog-browse/dialog-browse.component";
import { DialogExportImagesComponent } from "./components/dialogs/dialog-export-images/dialog-export-images.component";
import { BlueprintNameValidationDirective } from "./directives/blueprint-name-validation.directive";
import { QueuedPreviewDirective } from "./directives/queued-preview.directive";
import { TabInkDirective } from "./directives/tab-ink.directive";
import { StarRatingComponent } from "./components/star-rating/star-rating.component";
import { RatingWidgetComponent } from "./components/rating-widget/rating-widget.component";
import { ForkButtonComponent } from "./components/fork-button/fork-button.component";
import { BlueprintCardComponent } from "./components/blueprint-card/blueprint-card.component";
import { VersionHistoryDialogComponent } from "./components/dialogs/version-history-dialog/version-history-dialog.component";
import { BuildableElementPickerComponent } from "./components/side-bar/buildable-element-picker/buildable-element-picker.component";
import { ElementReport } from "./common/tools/element-report";
import { ElementReportToolComponent } from "./components/side-bar/element-report-tool/element-report-tool.component";
import { UiScreenContainerComponent } from "./components/side-bar/ui-screens/ui-screen-container/ui-screen-container.component";
import { SingleSliderScreenComponent } from "./components/side-bar/ui-screens/single-slider-screen/single-slider-screen.component";
import { ThresholdSwhitchScreenComponent } from "./components/side-bar/ui-screens/threshold-switch-screen/threshold-switch-screen.component";
import { ActiveRangeScreenComponent } from "./components/side-bar/ui-screens/active-range-screen/active-range-screen.component";
import { DialogAboutComponent } from "./components/dialogs/dialog-about/dialog-about.component";
import { TemperaturePickerComponent } from "./components/side-bar/temperature-picker/temperature-picker.component";
import { TemperatureScaleComponent } from "./components/side-bar/temperature-scale/temperature-scale.component";
import { ElementIconComponent } from "./components/side-bar/element-icon/element-icon.component";
import { CellElementPickerComponent } from "./components/side-bar/cell-element-picker/cell-element-picker.component";
import { FilterElementSolidPipe } from "./pipes/filter-element-solid.pipe";
import { FilterElementLiquidPipe } from "./pipes/filter-element-liquid.pipe";
import { FilterElementGasPipe } from "./pipes/filter-element-gas.pipe";
import { AddMassUnitPipe } from "./pipes/add-mass-unit.pipe";
import { BitSelectionScreenComponent } from "./components/side-bar/ui-screens/bit-selection-screen/bit-selection-screen.component";
import { InfoInputComponent } from "./components/side-bar/info-input/info-input.component";
import { InfoInputIconComponent } from "./components/side-bar/info-input-icon/info-input-icon.component";
import { PipeContentComponent } from "./components/side-bar/pipe-content/pipe-content.component";
import { LoginPageComponent } from "./components/user-auth/login-page/login-page.component";
import { RegisterPageComponent } from "./components/user-auth/register-page/register-page.component";
import { ForgotPasswordComponent } from "./components/user-auth/forgot-password/forgot-password.component";
import { MagicRequestComponent } from "./components/user-auth/magic-request/magic-request.component";
import { MagicCallbackComponent } from "./components/user-auth/magic-callback/magic-callback.component";
import { ResetPasswordComponent } from "./components/user-auth/reset-password/reset-password.component";
import { VerifyEmailCallbackComponent } from "./components/user-auth/verify-email-callback/verify-email-callback.component";
import { FeedbackDialogComponent } from "./components/dialogs/feedback-dialog/feedback-dialog.component";
import { FeedbackService } from "./services/feedback.service";
import { CommentSectionComponent } from "./components/comment-section/comment-section.component";
import { BlueprintDetailsPageComponent } from "./components/blueprint-details-page/blueprint-details-page.component";
import { CommentService } from "./services/comment.service";
import { BlueprintVersionService } from "./services/blueprint-version.service";
import { BrowsePageComponent } from "./components/browse-page/browse-page.component";
import { ProfilePageComponent } from "./components/profile-page/profile-page.component";
import { DialogFollowListComponent } from "./components/dialogs/dialog-follow-list/dialog-follow-list.component";
import { NotificationBellComponent } from "./components/notification-bell/notification-bell.component";
import { ToolbarButtonComponent } from "./components/toolbar-button/toolbar-button.component";

@NgModule({
  declarations: [
    UsernameValidationDirective,
    BlueprintNameValidationDirective,
    ComponentCanvasComponent,
    MouseWheelDirective,
    DragAndDropDirective,
    KeyboardDirective,
    UserMenuComponent,
    SiteNavComponent,
    ComponentMenuComponent,
    ComponentBlueprintParentComponent,
    ComponentSaveDialogComponent,
    ComponentSideBuildToolComponent,
    ComponentSideSelectionToolComponent,
    DialogShareUrlComponent,
    DialogImportStringComponent,
    ItemCollectionInfoComponent,
    DialogBrowseComponent,
    DialogExportImagesComponent,
    StarRatingComponent,
    RatingWidgetComponent,
    ForkButtonComponent,
    BlueprintCardComponent,
    VersionHistoryDialogComponent,
    BuildableElementPickerComponent,
    ElementReportToolComponent,
    UiScreenContainerComponent,
    SingleSliderScreenComponent,
    ThresholdSwhitchScreenComponent,
    ActiveRangeScreenComponent,
    DialogAboutComponent,
    TemperaturePickerComponent,
    TemperatureScaleComponent,
    ElementIconComponent,
    CellElementPickerComponent,
    FilterElementSolidPipe,
    FilterElementLiquidPipe,
    FilterElementGasPipe,
    AddMassUnitPipe,
    BitSelectionScreenComponent,
    InfoInputComponent,
    InfoInputIconComponent,
    PipeContentComponent,
    LoginPageComponent,
    RegisterPageComponent,
    ForgotPasswordComponent,
    MagicRequestComponent,
    MagicCallbackComponent,
    ResetPasswordComponent,
    VerifyEmailCallbackComponent,
    FeedbackDialogComponent,
    CommentSectionComponent,
    BlueprintDetailsPageComponent,
    BrowsePageComponent,
    ProfilePageComponent,
    DialogFollowListComponent,
    NotificationBellComponent,
    ToolbarButtonComponent,
  ],
  exports: [ComponentBlueprintParentComponent],
  imports: [
    CommonModule,
    QueuedPreviewDirective,
    TabInkDirective,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    Textarea,
    PasswordModule,
    ColorPickerModule,
    InputTextModule,
    SliderModule,
    ButtonModule,
    CardModule,
    ScrollPanelModule,
    PopoverModule,
    MenubarModule,
    MenuModule,
    TabsModule,
    DialogModule,
    SelectModule,
    AccordionModule,
    ToastModule,
    TooltipModule,
    PanelModule,
    ToggleSwitchModule,
    CheckboxModule,
    FieldsetModule,
    ListboxModule,
    ToggleButtonModule,
    DrawerModule,
    RadioButtonModule,
    BrowserAnimationsModule,
  ],
  providers: [
    AuthenticationService,
    FeedbackService,
    CommentService,
    BlueprintVersionService,
    BlueprintService,
    ToolService,
    SelectTool,
    BuildTool,
    ScissorsTool,
    ElementReport,
    DatePipe,
    MessageService,
    provideHttpClient(withInterceptorsFromDi()),
  ],
})
export class ModuleBlueprintModule {}
