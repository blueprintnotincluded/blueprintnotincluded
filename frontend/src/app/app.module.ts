import { BrowserModule, EventManager } from "@angular/platform-browser";
import { NgModule, ErrorHandler } from "@angular/core";
import { Router } from "@angular/router";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { providePrimeNG } from "primeng/config";
import Aura from "@primeuix/themes/aura";
import { definePreset } from "@primeuix/themes";
import {
  NgxGoogleAnalyticsModule,
  NgxGoogleAnalyticsRouterModule,
} from "ngx-google-analytics";
import * as Sentry from "@sentry/angular";
import { FormsModule } from "@angular/forms";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";

import { ModuleBlueprintModule } from "./module-blueprint/module-blueprint.module";
import { CustomEventManager } from "./module-blueprint/directives/custom-event-manager";
import { RequestResetComponent } from "./password-reset/request-reset.component";

const BniTheme = definePreset(Aura, {
  primitive: {
    bni: {
      50: "#f0f8ff",
      100: "#e0f2ff",
      200: "#bde2ff",
      300: "#80c8ff",
      400: "#38a9ff",
      500: "#007ad9",
      600: "#006bbd",
      700: "#005494",
      800: "#003f70",
      900: "#002947",
      950: "#001a2e",
    },
  },
  semantic: {
    primary: {
      50: "{bni.50}",
      100: "{bni.100}",
      200: "{bni.200}",
      300: "{bni.300}",
      400: "{bni.400}",
      500: "{bni.500}",
      600: "{bni.600}",
      700: "{bni.700}",
      800: "{bni.800}",
      900: "{bni.900}",
      950: "{bni.950}",
    },
  },
});
@NgModule({
  declarations: [AppComponent, RequestResetComponent],
  bootstrap: [AppComponent],
  imports: [
    BrowserModule,
    NgxGoogleAnalyticsModule.forRoot(process.env.NG_APP_GA_TRACKING_CODE),
    NgxGoogleAnalyticsRouterModule.forRoot(),
    ModuleBlueprintModule,
    AppRoutingModule,
    FormsModule,
  ],
  providers: [
    { provide: EventManager, useClass: CustomEventManager },
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler({
        showDialog: true,
      }),
    },
    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    provideHttpClient(withInterceptorsFromDi()),
    providePrimeNG({ theme: { preset: BniTheme } }),
  ],
})
export class AppModule {
  constructor(trace: Sentry.TraceService) {}
}
