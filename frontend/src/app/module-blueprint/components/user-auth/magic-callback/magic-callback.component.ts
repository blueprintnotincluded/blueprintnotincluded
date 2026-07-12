import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-magic-callback",
  templateUrl: "./magic-callback.component.html",
  styleUrls: ["./magic-callback.component.css"],
  standalone: false,
})
export class MagicCallbackComponent implements OnInit {
  loading = true;
  errorMessage = "";

  constructor(
    private authService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const code = this.route.snapshot.queryParams["code"];
    const email = this.route.snapshot.queryParams["email"];

    if (!code || !email) {
      this.loading = false;
      this.errorMessage = "Invalid sign-in link.";
      return;
    }

    this.authService.verifyMagicCode(code, email).subscribe({
      next: (res) => {
        this.authService.saveToken(res.token);
        this.router.navigate(["/"]);
      },
      error: () => {
        this.loading = false;
        this.errorMessage =
          "This sign-in link has expired or already been used.";
      },
    });
  }
}
