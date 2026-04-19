import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthenticationService } from "../services/authentification-service";

export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthenticationService);
  const router = inject(Router);
  return router.createUrlTree([auth.isAlpha() ? "/discover" : "/editor"]);
};
