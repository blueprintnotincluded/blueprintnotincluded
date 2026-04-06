import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-auth-callback",
  template: "",
  standalone: false,
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthenticationService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    const code = this.route.snapshot.queryParams["code"];
    const errorMessage = this.route.snapshot.queryParams["message"];

    if (code) {
      this.authService.exchangeCode(code).subscribe({
        next: (response: { token: string }) => {
          this.authService.saveToken(response.token);
          this.router.navigate(["/"]);
        },
        error: () => {
          this.messageService.add({
            severity: "error",
            summary: "Login failed",
            detail: "Code exchange failed",
          });
          this.router.navigate(["/"]);
        },
      });
    } else {
      this.messageService.add({
        severity: "error",
        summary: "Login failed",
        detail: errorMessage || "Authentication failed",
      });
      this.router.navigate(["/"]);
    }
  }
}
