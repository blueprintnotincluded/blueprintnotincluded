import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeuix/themes/aura";

import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { DialogModule } from "primeng/dialog";
import { SelectModule } from "primeng/select";
import { TagModule } from "primeng/tag";
import { TooltipModule } from "primeng/tooltip";

import { AdminRoutingModule } from "./admin-routing.module";
import { AdminRootComponent } from "./admin-root.component";
import { AccessDeniedComponent } from "./access-denied.component";
import { FeedbackListComponent } from "./feedback/feedback-list.component";

@NgModule({
  declarations: [
    AdminRootComponent,
    AccessDeniedComponent,
    FeedbackListComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    FormsModule,
    AdminRoutingModule,
    ButtonModule,
    TableModule,
    DialogModule,
    SelectModule,
    TagModule,
    TooltipModule,
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    providePrimeNG({ theme: { preset: Aura } }),
  ],
  bootstrap: [AdminRootComponent],
})
export class AdminModule {}
