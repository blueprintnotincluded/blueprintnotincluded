import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";
import { ComponentBlueprintParentComponent } from "./module-blueprint/components/component-blueprint-parent/component-blueprint-parent.component";
import { AuthCallbackComponent } from "./module-blueprint/components/user-auth/auth-callback/auth-callback.component";
import { LoginPageComponent } from "./module-blueprint/components/user-auth/login-page/login-page.component";
import { RegisterPageComponent } from "./module-blueprint/components/user-auth/register-page/register-page.component";
import { ForgotPasswordComponent } from "./module-blueprint/components/user-auth/forgot-password/forgot-password.component";
import { MagicRequestComponent } from "./module-blueprint/components/user-auth/magic-request/magic-request.component";
import { MagicCallbackComponent } from "./module-blueprint/components/user-auth/magic-callback/magic-callback.component";
import { ResetPasswordComponent } from "./module-blueprint/components/user-auth/reset-password/reset-password.component";

const routes: Routes = [
  { path: "", component: ComponentBlueprintParentComponent },
  { path: "b/:id", component: ComponentBlueprintParentComponent },
  {
    path: "b/:id/hideui/:width/:height",
    component: ComponentBlueprintParentComponent,
  },
  { path: "openfromurl/:url", component: ComponentBlueprintParentComponent },
  { path: "browse", component: ComponentBlueprintParentComponent },
  { path: "about", component: ComponentBlueprintParentComponent },
  { path: "login", component: LoginPageComponent },
  { path: "login/forgot", component: ForgotPasswordComponent },
  { path: "login/magic", component: MagicRequestComponent },
  { path: "register", component: RegisterPageComponent },
  { path: "auth/magic", component: MagicCallbackComponent },
  { path: "auth/reset-password", component: ResetPasswordComponent },
  { path: "auth/callback", component: AuthCallbackComponent },
  { path: "auth/error", component: AuthCallbackComponent },
  { path: "", redirectTo: "/", pathMatch: "prefix" },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
