import { Component } from "@angular/core";
import { Router } from "@angular/router";
import { FeedbackService } from "../../../services/feedback.service";
import { AuthenticationService } from "../../../services/authentification-service";

type State = "idle" | "submitting" | "success" | "error";

@Component({
  selector: "app-feedback-dialog",
  templateUrl: "./feedback-dialog.component.html",
  standalone: false,
})
export class FeedbackDialogComponent {
  visible = false;
  message = "";
  state: State = "idle";

  constructor(
    private feedbackService: FeedbackService,
    public authService: AuthenticationService,
    private router: Router,
  ) {}

  public open() {
    this.visible = true;
    this.message = "";
    this.state = "idle";
  }

  // Sending feedback requires an account (the endpoint is JWT-guarded, which is
  // our spam guard). Rather than let a logged-out visitor type a paragraph and
  // then fail on submit, the template shows a sign-in prompt instead of the
  // form — the gate is at open time, before any typing.
  public goToLogin() {
    this.visible = false;
    this.router.navigate(["/login"]);
  }

  public submit() {
    if (!this.authService.isLoggedIn()) return;
    if (!this.message.trim() || this.state === "submitting") return;
    this.state = "submitting";
    this.feedbackService.submit(this.message).subscribe({
      next: () => {
        this.state = "success";
      },
      error: () => {
        this.state = "error";
      },
    });
  }
}
