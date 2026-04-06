import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";
import { ComponentBlueprintParentComponent } from "./module-blueprint/components/component-blueprint-parent/component-blueprint-parent.component";
import { AuthCallbackComponent } from "./module-blueprint/components/user-auth/auth-callback/auth-callback.component";

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
  { path: "auth/callback", component: AuthCallbackComponent },
  { path: "auth/error", component: AuthCallbackComponent },
  { path: "", redirectTo: "/", pathMatch: "prefix" },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
