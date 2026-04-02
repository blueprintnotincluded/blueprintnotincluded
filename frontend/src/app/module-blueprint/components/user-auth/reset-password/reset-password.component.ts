import { Component, OnInit } from "@angular/core";
import {
  UntypedFormGroup,
  UntypedFormControl,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { MessageService } from "primeng/api";
import { AuthenticationService } from "../../../services/authentification-service";

@Component({
  selector: "app-reset-password",
  templateUrl: "./reset-password.component.html",
  styleUrls: ["./reset-password.component.css"],
  
})
export class ResetPasswordComponent implements OnInit {
  resetForm = new UntypedFormGroup({
    password: new UntypedFormControl("", [
      Validators.required,
      Validators.minLength(6),
    ]),
    confirmPassword: new UntypedFormControl("", [Validators.required]),
  });

  working = false;
  token: string;
  visible = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthenticationService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParams["token"];
    if (!this.token) {
      this.messageService.add({
        severity: "error",
        summary: "Error",
        detail: "Invalid reset token",
      });
      this.visible = false;
      this.router.navigate(["/"]);
    }
  }

  onSubmit() {
    if (this.resetForm.valid) {
      const { password, confirmPassword } = this.resetForm.value;

      if (password !== confirmPassword) {
        this.messageService.add({
          severity: "error",
          summary: "Error",
          detail: "Passwords do not match",
        });
        return;
      }

      this.working = true;
      this.authService.resetPassword(this.token, password).subscribe({
        next: () => {
          this.messageService.add({
            severity: "success",
            summary: "Success",
            detail: "Password has been reset successfully",
          });
          this.visible = false;
          this.router.navigate(["/"]);
        },
        error: () => {
          this.messageService.add({
            severity: "error",
            summary: "Error",
            detail: "Failed to reset password",
          });
          this.working = false;
        },
      });
    }
  }
}
