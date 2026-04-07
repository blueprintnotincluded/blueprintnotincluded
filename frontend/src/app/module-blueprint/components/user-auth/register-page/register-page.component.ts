import { Component } from "@angular/core";
import { Router } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-register-page",
  templateUrl: "./register-page.component.html",
  styleUrls: ["./register-page.component.css"],
  standalone: false,
})
export class RegisterPageComponent {
  username = "";
  email = "";
  password = "";
  loading = false;
  errorMessage = "";
  registered = false;

  constructor(
    private authService: AuthenticationService,
    private router: Router
  ) {}

  submit() {
    if (!this.email || !this.password || !this.username) return;
    this.loading = true;
    this.errorMessage = "";

    this.authService
      .registerWithPassword(this.email, this.password, this.username)
      .subscribe({
        next: () => {
          this.loading = false;
          this.registered = true;
        },
        error: (err) => {
          this.loading = false;
          const title = err?.error?.errors?.[0]?.title;
          this.errorMessage = title || "Registration failed. Please try again.";
        },
      });
  }
}
