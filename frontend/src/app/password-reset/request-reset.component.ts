import { Component } from "@angular/core";
import { PasswordResetService } from "../services/password-reset.service";

@Component({
  selector: "app-request-reset",
  template: `
    <div class="reset-form">
      <h2>Reset Password</h2>
      <form (ngSubmit)="onSubmit()">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            [(ngModel)]="email"
            name="email"
            required
          />
        </div>
        <button type="submit">Request Reset</button>
        <div *ngIf="message" [class]="messageClass">{{ message }}</div>
      </form>
    </div>
  `,
  styles: [
    `
      .reset-form {
        max-width: 400px;
        margin: 0 auto;
        padding: 20px;
      }
      .form-group {
        margin-bottom: 15px;
      }
      .success {
        color: green;
      }
      .error {
        color: red;
      }
    `,
  ],
  
})
export class RequestResetComponent {
  email: string = "";
  message: string = "";
  messageClass: string = "";

  constructor(private passwordResetService: PasswordResetService) {}

  onSubmit() {
    this.passwordResetService.requestReset(this.email).subscribe(
      (response) => {
        this.message = "Password reset email sent. Please check your inbox.";
        this.messageClass = "success";
      },
      (error) => {
        this.message = "Error requesting password reset.";
        this.messageClass = "error";
      }
    );
  }
}
