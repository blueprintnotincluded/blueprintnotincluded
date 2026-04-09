import { Component } from "@angular/core";
import { FeedbackService } from "../../../services/feedback.service";

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

  constructor(private feedbackService: FeedbackService) {}

  public open() {
    this.visible = true;
    this.message = "";
    this.state = "idle";
  }

  public submit() {
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
