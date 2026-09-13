import { Component, OnInit } from "@angular/core";
import { Router, ActivatedRoute } from "@angular/router";
import { MessageService } from "primeng/api";
import {
  AuthenticationService,
  DevUserInfo,
} from "../../../services/authentification-service";

@Component({
  selector: "app-login-page",
  templateUrl: "./login-page.component.html",
  styleUrls: ["./login-page.component.css"],
  standalone: false,
})
export class LoginPageComponent implements OnInit {
  email = "";
  password = "";
  loading = false;
  showLegacyHint = false;
  errorMessage = "";

  authMode: "workos" | "local" = "workos";
  devUsers: DevUserInfo[] = [];
  private devPassword = "";

  constructor(
    private authService: AuthenticationService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService,
  ) {}

  ngOnInit() {
    const reset = this.route.snapshot.queryParams["reset"];
    if (reset) {
      this.messageService.add({
        severity: "success",
        summary: "Password updated",
        detail: "Your password has been updated. Please log in.",
      });
    }

    // Advisory only: the ordinary email/password form works regardless of
    // whether this call succeeds, so a failure here is silently ignored.
    this.authService.getAuthMode().subscribe({
      next: (res) => {
        this.authMode = res.mode;
        this.devUsers = res.devUsers;
        this.devPassword = res.devPassword ?? "";
      },
      error: () => {},
    });
  }

  loginAsDevUser(devUser: DevUserInfo) {
    if (this.loading) return;
    this.loading = true;
    this.showLegacyHint = false;
    this.errorMessage = "";

    this.authService
      .loginWithPassword(devUser.email, this.devPassword)
      .subscribe({
        next: (result) => {
          this.loading = false;
          if (result.kind === "success") {
            this.authService.saveToken(result.token);
            this.router.navigate(["/"]);
          } else {
            this.errorMessage = "Could not sign in as this dev user.";
          }
        },
        error: () => {
          this.loading = false;
          this.errorMessage = "Could not sign in as this dev user.";
        },
      });
  }

  submit() {
    if (!this.email || !this.password) return;
    this.loading = true;
    this.showLegacyHint = false;
    this.errorMessage = "";

    this.authService.loginWithPassword(this.email, this.password).subscribe({
      next: (result) => {
        this.loading = false;
        if (result.kind === "success") {
          this.authService.saveToken(result.token);
          this.router.navigate(["/"]);
        } else if (result.kind === "legacy_account") {
          this.showLegacyHint = true;
        } else {
          this.errorMessage = "Incorrect email or password.";
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = "Incorrect email or password.";
      },
    });
  }

  resetPassword() {
    this.router.navigate(["/login/forgot"], {
      queryParams: { email: this.email },
    });
  }
}
