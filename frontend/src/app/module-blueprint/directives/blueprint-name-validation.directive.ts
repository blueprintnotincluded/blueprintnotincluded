import { Directive } from "@angular/core";
import { Validator, AbstractControl, NG_VALIDATORS } from "@angular/forms";
import { validateBlueprintName } from "../../../../../lib/index";

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

  validate(control: AbstractControl): { [key: string]: any } | null {
    return BlueprintNameValidationDirective.validateBlueprintName(control);
  }

  // Delegates to the shared policy in lib so the dialog rejects exactly what
  // the upload endpoint rejects — the failure being avoided is a title the form
  // accepts and the server then 400s. The error carries the policy's `reason`
  // rather than its message: now that most characters are legal, a rejection
  // has to say which rule it broke, and the wording has to stay in the template
  // where $localize can translate it (this dialog's audience is precisely the
  // non-English authors the relaxed policy exists for).
  static validateBlueprintName(control: AbstractControl): {
    [key: string]: any;
  } | null {
    if (control.value == null) return null;
    if (control.value.length == 0) return null;

    const result = validateBlueprintName(control.value);
    if (result.ok) return null;
    if (result.reason === "too-long") return { tooLong: true };
    return { invalidChars: true, nameReason: result.reason };
  }
}
