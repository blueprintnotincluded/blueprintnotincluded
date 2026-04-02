import { Component, OnInit, Output, EventEmitter } from "@angular/core";
import {
  UntypedFormGroup,
  UntypedFormControl,
  Validators,
  AbstractControl,
  FormBuilder,
} from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { CheckDuplicateService } from "../../../services/check-duplicate-service";
import { AuthenticationService } from "../../../services/authentification-service";
import { MessageService } from "primeng/api";
import { Subscription, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { UsernameValidationDirective } from "src/app/module-blueprint/directives/username-validation.directive";

@Component({
  selector: "app-register-form",
  templateUrl: "./register-form.component.html",
  styleUrls: ["./register-form.component.css"],
})
export class RegisterFormComponent {
  registerForm = new UntypedFormGroup(
    {
      email: new UntypedFormControl("", [
        Validators.required,
        Validators.email,
      ]),
      username: new UntypedFormControl(
        "",
        [Validators.required, UsernameValidationDirective.validate],
        [this.checkDuplicateService.usernameValidator()]
      ),
      password: new UntypedFormControl("", [Validators.required]),
      confirmPassword: new UntypedFormControl("", [Validators.required]),
    },
    { validators: [this.passwordConfirming] }
  );

  @Output() registrationOk = new EventEmitter();

  constructor(
    private authService: AuthenticationService,
    private checkDuplicateService: CheckDuplicateService,
    private messageService: MessageService
  ) {}

  get f() {
    return this.registerForm.controls;
  }
  get icon() {
    return this.working ? "pi pi-spin pi-spinner" : "";
  }

  working: boolean = false;
  authError: boolean = false;
  duplicateError: boolean = false;

  reset() {
    this.working = false;
    this.authError = false;
    this.duplicateError = false;
    this.registerForm.reset();
  }

  passwordConfirming(c: AbstractControl): { invalid: boolean } {
    if (c.get("password").value !== c.get("confirmPassword").value)
      return { invalid: true };
  }

  subscription: Subscription;
  registerSubscription: Subscription;

  onSubmit() {
    this.working = true;

    let payload = {
      email: this.registerForm.value.email as string,
      username: this.registerForm.value.username as string,
      password: this.registerForm.value.password as string,
    };

    this.registerSubscription = this.authService.register(payload).subscribe({
      next: (response) => {
        this.handleSaveNext(response);
      },
      error: (error) => {
        this.handleSaveError(error);
      },
    });
  }

  handleSaveNext(data: any) {
    if (data.duplicateError) this.duplicateError = true;
    else if (data.token) {
      this.registrationOk.emit();

      const userDetails = this.authService.getUserDetails();
      if (!userDetails) {
        this.handleSaveError("User details not available");
        return;
      }

      const username = userDetails.username;
      let summary: string = $localize`Registration Successful`;
      let detail: string = $localize`Welcome ${username}`;
      this.messageService.add({
        severity: "success",
        summary: summary,
        detail: detail,
      });
    }

    this.working = false;

    if (this.registerSubscription) {
      this.registerSubscription.unsubscribe();
    }
  }

  handleSaveError(error: any) {
    this.authError = true;
    this.working = false;

    if (this.registerSubscription) {
      this.registerSubscription.unsubscribe();
    }
  }
}
