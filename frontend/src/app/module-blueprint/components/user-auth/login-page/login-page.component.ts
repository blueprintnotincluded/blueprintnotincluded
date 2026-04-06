import { Component, OnInit } from "@angular/core";
import { Router, ActivatedRoute } from "@angular/router";
import { MessageService } from "primeng/api";
import { AuthenticationService } from "../../../services/authentification-service";

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

  constructor(
    private authService: AuthenticationService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService
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

  sendMagicLink() {
    this.router.navigate(["/login/magic"], {
      queryParams: { email: this.email },
    });
  }
}
