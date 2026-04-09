import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { FeedbackListComponent } from "./feedback/feedback-list.component";
import { AccessDeniedComponent } from "./access-denied.component";
import { AdminAuthGuard } from "./auth.guard";

const routes: Routes = [
  {
    path: "feedback",
    component: FeedbackListComponent,
    canActivate: [AdminAuthGuard],
  },
  { path: "denied", component: AccessDeniedComponent },
  { path: "", redirectTo: "feedback", pathMatch: "full" },
  { path: "**", redirectTo: "feedback" },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
