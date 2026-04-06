import { Component } from "@angular/core";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-forgot-password",
  templateUrl: "./forgot-password.component.html",
  styleUrls: ["./forgot-password.component.css"],
  standalone: false,
})
export class ForgotPasswordComponent {
  email = "";
  loading = false;
  submitted = false;

  constructor(private authService: AuthenticationService) {}

  submit() {
    if (!this.email) return;
    this.loading = true;

    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.loading = false;
        this.submitted = true;
      },
      error: () => {
        this.loading = false;
        this.submitted = true; // Still show the message — no enumeration
      },
    });
  }
}
