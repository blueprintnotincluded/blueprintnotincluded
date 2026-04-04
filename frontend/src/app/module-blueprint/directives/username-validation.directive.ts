import { Directive } from "@angular/core";
import { Validator, AbstractControl, NG_VALIDATORS } from "@angular/forms";

@Directive({
  selector: "[appUsernameValidation]",
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: UsernameValidationDirective,
      multi: true,
    },
  ],
  standalone: false,
})
export class UsernameValidationDirective implements Validator {
  constructor() {}

  static regexp = /^[a-zA-Z0-9-_]+$/;
  validate(control: AbstractControl): { [key: string]: any } | null {
    return UsernameValidationDirective.validate(control);
  }

  static validate(control: AbstractControl): { [key: string]: any } | null {
    let returnValue: { [key: string]: any } | null = null;
    if (control.value == null) return returnValue;
    if (control.value.length == 0) return returnValue;

    if (control.value.search(UsernameValidationDirective.regexp) == -1) {
      if (returnValue == null) returnValue = {};
      returnValue["invalidChars"] = true;
    }

    if (control.value.length > 30) {
      if (returnValue == null) returnValue = {};
      returnValue["tooLong"] = true;
    }

    return returnValue;
  }
}
