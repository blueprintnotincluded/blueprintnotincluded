import { BlueprintNameValidationDirective } from "./blueprint-name-validation.directive";

const makeControl = (value: string | null) => ({ value }) as any;

const validate = (value: string | null) =>
  BlueprintNameValidationDirective.validateBlueprintName(makeControl(value));

// The dialog must reject exactly what POST /api/uploadblueprint rejects — the
// failure being guarded against is a title the form accepts and the server
// 400s. Character-class coverage lives with the shared policy in
// lib/src/blueprint/blueprint-name.ts; this asserts the directive's mapping
// from a policy rejection to a form error.
describe("BlueprintNameValidationDirective", () => {
  it("returns null for null and empty values", () => {
    expect(validate(null)).toBeNull();
    expect(validate("")).toBeNull();
  });

  it("accepts non-Latin titles, which the old ASCII regex rejected", () => {
    expect(validate("电解制氧系统")).toBeNull();
    expect(validate("Ферма для слизи")).toBeNull();
    expect(validate("산소 발생기")).toBeNull();
    expect(validate("Máy lọc nước")).toBeNull();
    expect(validate("Base #1 (v2.5)")).toBeNull();
  });

  it("reports the policy reason so the dialog can explain the rejection", () => {
    // U+202E right-to-left override, as an escape — a literal would be
    // invisible in this file.
    const result = validate("Base\u202eOne");
    expect(result!["invalidChars"]).toBe(true);
    expect(result!["nameReason"]).toBe("invisible");
  });

  it("flags Latin/Cyrillic homoglyph mixing inside one word", () => {
    // U+043E Cyrillic small o.
    expect(validate("R\u043edriguez")!["nameReason"]).toBe("mixed-script");
  });

  it("reports a whitespace-only title as required, not as invalid characters", () => {
    // Non-empty to Angular's own `required`, but normalizes to nothing. U+00A0
    // is a no-break space, written as an escape.
    for (const value of ["   ", "\t\t", "\u00a0", " \t\u00a0 "]) {
      expect(validate(value)).toEqual({ required: true });
    }
  });

  it("returns tooLong past 60 characters and null at exactly 60", () => {
    expect(validate("a".repeat(61))!["tooLong"]).toBe(true);
    expect(validate("a".repeat(60))).toBeNull();
  });

  it("delegates from the instance method", () => {
    const directive = new BlueprintNameValidationDirective();
    const spy = vi.spyOn(
      BlueprintNameValidationDirective,
      "validateBlueprintName",
    );
    const control = makeControl("Base");
    directive.validate(control);
    expect(spy).toHaveBeenCalledWith(control);
  });
});
