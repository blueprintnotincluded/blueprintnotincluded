import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-register-page",
  templateUrl: "./register-page.component.html",
  styleUrls: ["./register-page.component.css"],
  standalone: false,
})
export class RegisterPageComponent implements OnInit {
  username = "";
  email = "";
  password = "";
  loading = false;
  errorMessage = "";

  authMode: "workos" | "local" = "workos";

  constructor(
    private authService: AuthenticationService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.authService.getAuthMode().subscribe({
      next: (res) => {
        this.authMode = res.mode;
      },
      error: () => {},
    });
  }

  submit() {
    if (!this.email || !this.password || !this.username) return;
    this.loading = true;
    this.errorMessage = "";

    this.authService
      .registerWithPassword(this.email, this.password, this.username)
      .subscribe({
        next: (res) => {
          this.loading = false;
          if (res.token) {
            // Local mode: no email verification step, log straight in.
            this.authService.saveToken(res.token);
            this.router.navigate(["/"]);
          } else {
            this.router.navigate(["/auth/verify-email"], {
              queryParams: { userId: res.userId },
            });
          }
        },
        error: (err) => {
          this.loading = false;
          const title = err?.error?.errors?.[0]?.title;
          this.errorMessage = title || "Registration failed. Please try again.";
        },
      });
  }
}
