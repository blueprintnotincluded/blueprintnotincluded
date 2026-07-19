import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";
import { ComponentBlueprintParentComponent } from "./module-blueprint/components/component-blueprint-parent/component-blueprint-parent.component";
import { LoginPageComponent } from "./module-blueprint/components/user-auth/login-page/login-page.component";
import { RegisterPageComponent } from "./module-blueprint/components/user-auth/register-page/register-page.component";
import { ForgotPasswordComponent } from "./module-blueprint/components/user-auth/forgot-password/forgot-password.component";
import { MagicRequestComponent } from "./module-blueprint/components/user-auth/magic-request/magic-request.component";
import { MagicCallbackComponent } from "./module-blueprint/components/user-auth/magic-callback/magic-callback.component";
import { ResetPasswordComponent } from "./module-blueprint/components/user-auth/reset-password/reset-password.component";
import { VerifyEmailCallbackComponent } from "./module-blueprint/components/user-auth/verify-email-callback/verify-email-callback.component";
import { BrowsePageComponent } from "./module-blueprint/components/browse-page/browse-page.component";
import { ProfilePageComponent } from "./module-blueprint/components/profile-page/profile-page.component";
import { BlueprintDetailsPageComponent } from "./module-blueprint/components/blueprint-details-page/blueprint-details-page.component";
import { homeRedirectGuard } from "./module-blueprint/guards/home-redirect.guard";
import { SupportedModsPageComponent } from "./module-blueprint/components/supported-mods-page/supported-mods-page.component";

const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    canActivate: [homeRedirectGuard],
    component: ComponentBlueprintParentComponent,
  },
  { path: "editor", component: ComponentBlueprintParentComponent },
  { path: "discover", component: BrowsePageComponent },
  { path: "mods", component: SupportedModsPageComponent },
  { path: "profile/:username", component: ProfilePageComponent },
  { path: "blueprint/:id", component: BlueprintDetailsPageComponent },
  { path: "b/:id", component: ComponentBlueprintParentComponent },
  {
    path: "b/:id/hideui/:width/:height",
    component: ComponentBlueprintParentComponent,
  },
  { path: "openfromurl/:url", component: ComponentBlueprintParentComponent },
  { path: "about", component: ComponentBlueprintParentComponent },
  { path: "login", component: LoginPageComponent },
  { path: "login/forgot", component: ForgotPasswordComponent },
  { path: "login/magic", component: MagicRequestComponent },
  { path: "register", component: RegisterPageComponent },
  { path: "auth/magic", component: MagicCallbackComponent },
  { path: "auth/verify-email", component: VerifyEmailCallbackComponent },
  { path: "auth/reset-password", component: ResetPasswordComponent },
  { path: "", redirectTo: "/", pathMatch: "prefix" },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
