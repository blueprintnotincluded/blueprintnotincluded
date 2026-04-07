import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-verify-email-callback",
  templateUrl: "./verify-email-callback.component.html",
  styleUrls: ["./verify-email-callback.component.css"],
  standalone: false,
})
export class VerifyEmailCallbackComponent implements OnInit {
  code = "";
  userId = "";
  loading = false;
  errorMessage = "";

  constructor(
    private authService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.userId = this.route.snapshot.queryParams["userId"] ?? "";
  }

  submit() {
    if (!this.code || !this.userId) return;
    this.loading = true;
    this.errorMessage = "";

    this.authService.verifyEmail(this.code, this.userId).subscribe({
      next: (res) => {
        this.authService.saveToken(res.token);
        this.router.navigate(["/"]);
      },
      error: () => {
        this.loading = false;
        this.errorMessage = "Invalid or expired code. Please try again.";
      },
    });
  }
}
