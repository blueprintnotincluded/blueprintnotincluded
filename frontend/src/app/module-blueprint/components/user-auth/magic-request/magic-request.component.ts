import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-magic-request",
  templateUrl: "./magic-request.component.html",
  styleUrls: ["./magic-request.component.css"],
  standalone: false,
})
export class MagicRequestComponent implements OnInit {
  email = "";
  loading = false;
  submitted = false;

  constructor(
    private authService: AuthenticationService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Pre-fill email if passed as query param (from legacy hint on login page)
    const email = this.route.snapshot.queryParams["email"];
    if (email) {
      this.email = email;
    }
  }

  submit() {
    if (!this.email) return;
    this.loading = true;

    this.authService.sendMagicLink(this.email).subscribe({
      next: () => {
        this.loading = false;
        this.submitted = true;
      },
      error: () => {
        this.loading = false;
        this.submitted = true; // Always show confirmation — no enumeration
      },
    });
  }
}
