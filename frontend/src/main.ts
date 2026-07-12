import { enableProdMode } from "@angular/core";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import * as Sentry from "@sentry/angular";

import { AppModule } from "./app/app.module";
import { environment } from "./environments/environment";

if (environment.production) {
  enableProdMode();
}

Sentry.init({
  dsn: process.env.NG_APP_SENTRY_DSN,
  enabled: environment.production,
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ["localhost", "https://blueprintnotincluded.org"],
  tracesSampleRate: 1.0,
});

// Global handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  console.warn(
    "Unhandled promise rejection caught and prevented:",
    event.reason,
  );
  // Prevent the default behavior (console error)
  event.preventDefault();
});

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
