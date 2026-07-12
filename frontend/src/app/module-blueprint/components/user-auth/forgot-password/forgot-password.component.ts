import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-forgot-password",
  templateUrl: "./forgot-password.component.html",
  styleUrls: ["./forgot-password.component.css"],
  standalone: false,
})
export class ForgotPasswordComponent implements OnInit {
  email = "";
  loading = false;
  submitted = false;

  constructor(
    private authService: AuthenticationService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    const email = this.route.snapshot.queryParams["email"];
    if (email) {
      this.email = email;
    }
  }

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
