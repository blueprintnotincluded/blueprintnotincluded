import { Directive } from "@angular/core";
import { Validator, AbstractControl, NG_VALIDATORS } from "@angular/forms";

@Directive({
  selector: "[appBlueprintNameValidation]",
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: BlueprintNameValidationDirective,
      multi: true,
    },
  ],
  standalone: false,
})
export class BlueprintNameValidationDirective implements Validator {
  constructor() {}

  static regexp = /^[a-zA-Z0-9-_ ]+$/;
  validate(control: AbstractControl): { [key: string]: any } | null {
    return BlueprintNameValidationDirective.validateBlueprintName(control);
  }

  static validateBlueprintName(control: AbstractControl): {
    [key: string]: any;
  } | null {
    let returnValue: { [key: string]: any } | null = null;
    if (control.value == null) return returnValue;
    if (control.value.length == 0) return returnValue;

    if (control.value.search(BlueprintNameValidationDirective.regexp) == -1) {
      if (returnValue == null) returnValue = {};
      returnValue["invalidChars"] = true;
    }

    if (control.value.length > 60) {
      if (returnValue == null) returnValue = {};
      returnValue["tooLong"] = true;
    }

    return returnValue;
  }
}
