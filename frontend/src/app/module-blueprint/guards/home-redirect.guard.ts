import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

export const homeRedirectGuard: CanActivateFn = () => {
  const router = inject(Router);
  return router.createUrlTree(["/discover"]);
};
