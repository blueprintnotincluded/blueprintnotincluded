import { Injectable } from "@angular/core";
import { CanActivate, Router } from "@angular/router";
import { AdminAuthService } from "./auth.service";

@Injectable({ providedIn: "root" })
export class AdminAuthGuard implements CanActivate {
  constructor(private auth: AdminAuthService, private router: Router) {}

  canActivate(): boolean {
    if (this.auth.isAdmin()) return true;
    this.router.navigate(["/denied"]);
    return false;
  }
}
