import {
  Component,
  OnInit,
  OnDestroy,
  EventEmitter,
  Output,
} from "@angular/core";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { AuthenticationService } from "../../../services/authentification-service";
import { MessageService } from "primeng/api";
import { ReCaptchaV3Service } from "ng-recaptcha";
import { Observable, Subscription, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { UsernameValidationDirective } from "src/app/module-blueprint/directives/username-validation.directive";
import { Dialog } from "primeng/dialog";

@Component({
  selector: "app-login-form",
  templateUrl: "./login-form.component.html",
  styleUrls: ["./login-form.component.css"],
})
export class LoginFormComponent implements OnDestroy {
  loginForm = new FormGroup({
    username: new FormControl("", [
      Validators.required,
      UsernameValidationDirective.validate,
    ]),
    password: new FormControl("", [Validators.required]),
  });

  @Output() loginRegistration = new EventEmitter();
  @Output() loginOk = new EventEmitter();

  constructor(
    private authService: AuthenticationService,
    private recaptchaV3Service: ReCaptchaV3Service,
    private messageService: MessageService
  ) {}

  get f() {
    return this.loginForm.controls;
  }
  get icon() {
    return this.working ? "pi pi-spin pi-spinner" : "";
  }

  working: boolean = false;
  authError: boolean = false;
  showResetDialog: boolean = false;
  resetEmail: string = "";

  reset() {
    this.working = false;
    this.authError = false;
    this.loginForm.reset();
  }

  subscription: Subscription;
  loginSubscription: Subscription;
  resetSubscription: Subscription;
  passwordResetSubscription: Subscription;

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.loginSubscription) {
      this.loginSubscription.unsubscribe();
    }
    if (this.resetSubscription) {
      this.resetSubscription.unsubscribe();
    }
    if (this.passwordResetSubscription) {
      this.passwordResetSubscription.unsubscribe();
    }
  }

  onSubmit() {
    this.working = true;
    this.subscription = this.recaptchaV3Service
      .execute("login")
      .pipe(
        catchError((error) => {
          this.handleSaveError(error);
          return of(null);
        })
      )
      .subscribe({
        next: (token) => {
          if (token === null) {
            // reCAPTCHA failed, error already handled
            return;
          }

          let tokenPayload = {
            "g-recaptcha-response": token,
            email: "",
            username: this.loginForm.value.username as string,
            password: this.loginForm.value.password as string,
          };

          this.loginSubscription = this.authService
            .login(tokenPayload)
            .pipe(
              catchError((error) => {
                this.handleSaveError(error);
                return of(null);
              })
            )
            .subscribe({
              next: (response) => {
                if (response !== null) {
                  this.handleSaveNext(response);
                }
              },
              error: (error) => {
                this.handleSaveError(error);
              },
            });

          // Unsubscribe from recaptcha after starting login subscription
          if (this.subscription) {
            this.subscription.unsubscribe();
          }
        },
        error: (error) => {
          this.handleSaveError(error);
        },
      });
  }

  handleSaveNext(response: any) {
    this.loginOk.emit();

    const userDetails = this.authService.getUserDetails();
    if (!userDetails) {
      this.handleSaveError("User details not available");
      return;
    }

    const username = userDetails.username;
    let summary: string = $localize`Login Successful`;
    let detail: string = $localize`Welcome ${username}`;

    this.messageService.add({
      severity: "success",
      summary: summary,
      detail: detail,
    });
    this.working = false;

    if (this.loginSubscription) {
      this.loginSubscription.unsubscribe();
    }
  }

  handleSaveError(error: any) {
    this.authError = true;
    this.working = false;

    if (this.loginSubscription) {
      this.loginSubscription.unsubscribe();
    }
  }

  registration() {
    this.loginRegistration.emit();
  }

  forgotPassword() {
    this.showResetDialog = true;
  }

  requestReset() {
    if (!this.resetEmail) {
      this.messageService.add({
        severity: "error",
        summary: "Error",
        detail: "Please enter your email address",
      });
      return;
    }

    this.resetSubscription = this.recaptchaV3Service
      .execute("resetPassword")
      .pipe(
        catchError((error) => {
          this.messageService.add({
            severity: "error",
            summary: "Error",
            detail: "Failed to verify reCAPTCHA",
          });
          return of(null);
        })
      )
      .subscribe({
        next: (token) => {
          if (token === null) {
            // reCAPTCHA failed, error already handled
            return;
          }

          this.passwordResetSubscription = this.authService
            .requestPasswordReset(this.resetEmail)
            .subscribe({
              next: () => {
                this.messageService.add({
                  severity: "success",
                  summary: "Reset Email Sent",
                  detail:
                    "Please check your inbox for password reset instructions",
                });
                this.showResetDialog = false;
                this.resetEmail = "";
              },
              error: () => {
                this.messageService.add({
                  severity: "error",
                  summary: "Error",
                  detail: "Failed to send reset email",
                });
              },
            });
        },
        error: (error) => {
          this.messageService.add({
            severity: "error",
            summary: "Error",
            detail: "Failed to verify reCAPTCHA",
          });
        },
      });
  }
}
