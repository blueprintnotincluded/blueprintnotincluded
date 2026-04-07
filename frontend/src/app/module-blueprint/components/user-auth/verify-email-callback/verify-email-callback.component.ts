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
  loading = true;
  errorMessage = "";

  constructor(
    private authService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    const code = this.route.snapshot.queryParams["code"];
    const userId = this.route.snapshot.queryParams["user_id"];

    if (!code || !userId) {
      this.loading = false;
      this.errorMessage = "Invalid verification link.";
      return;
    }

    this.authService.verifyEmail(code, userId).subscribe({
      next: (res) => {
        this.authService.saveToken(res.token);
        this.router.navigate(["/"]);
      },
      error: () => {
        this.loading = false;
        this.errorMessage =
          "This verification link has expired or already been used.";
      },
    });
  }
}
