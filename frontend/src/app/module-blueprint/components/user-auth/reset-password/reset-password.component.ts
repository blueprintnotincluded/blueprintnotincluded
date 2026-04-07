import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-reset-password",
  templateUrl: "./reset-password.component.html",
  styleUrls: ["./reset-password.component.css"],
  standalone: false,
})
export class ResetPasswordComponent implements OnInit {
  token = "";
  newPassword = "";
  confirmPassword = "";
  loading = false;
  errorMessage = "";
  tokenError = false;

  constructor(
    private authService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParams["token"] ?? "";
    if (!this.token) {
      this.tokenError = true;
      this.errorMessage = "Invalid or missing reset token.";
    }
  }

  submit() {
    if (!this.newPassword || !this.confirmPassword) return;
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = "Passwords do not match.";
      return;
    }

    this.loading = true;
    this.errorMessage = "";
    this.tokenError = false;

    this.authService
      .resetPasswordWithToken(this.token, this.newPassword)
      .subscribe({
        next: () => {
          this.loading = false;
          this.router.navigate(["/login"], { queryParams: { reset: 1 } });
        },
        error: (err) => {
          this.loading = false;
          this.tokenError = true;
          const title = err?.error?.errors?.[0]?.title;
          this.errorMessage =
            title || "Failed to reset password. The link may have expired.";
        },
      });
  }
}
