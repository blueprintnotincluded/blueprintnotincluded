import { UsernameValidationDirective } from "./username-validation.directive";

const makeControl = (value: string | null) => ({ value } as any);

describe("UsernameValidationDirective", () => {
  describe("validate (static)", () => {
    it("returns null for null value", () => {
      expect(
        UsernameValidationDirective.validate(makeControl(null))
      ).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(UsernameValidationDirective.validate(makeControl(""))).toBeNull();
    });

    it("returns null for valid alphanumeric username", () => {
      expect(
        UsernameValidationDirective.validate(makeControl("alice123"))
      ).toBeNull();
    });

    it("returns null for username with allowed special chars (- and _)", () => {
      expect(
        UsernameValidationDirective.validate(makeControl("alice_bob-99"))
      ).toBeNull();
    });

    it("returns invalidChars for username with space", () => {
      const result = UsernameValidationDirective.validate(
        makeControl("alice bob")
      );
      expect(result).not.toBeNull();
      expect(result!["invalidChars"]).toBe(true);
    });

    it("returns invalidChars for username with @", () => {
      const result = UsernameValidationDirective.validate(
        makeControl("alice@example")
      );
      expect(result).not.toBeNull();
      expect(result!["invalidChars"]).toBe(true);
    });

    it("returns invalidChars for username with dot", () => {
      const result = UsernameValidationDirective.validate(
        makeControl("alice.bob")
      );
      expect(result!["invalidChars"]).toBe(true);
    });

    it("returns tooLong for username exceeding 30 chars", () => {
      const longName = "a".repeat(31);
      const result = UsernameValidationDirective.validate(
        makeControl(longName)
      );
      expect(result).not.toBeNull();
      expect(result!["tooLong"]).toBe(true);
    });

    it("returns null for exactly 30 char username", () => {
      const maxName = "a".repeat(30);
      expect(
        UsernameValidationDirective.validate(makeControl(maxName))
      ).toBeNull();
    });

    it("returns both errors for a long name with invalid chars", () => {
      const badLong = "alice bob ".repeat(4); // spaces + > 30 chars
      const result = UsernameValidationDirective.validate(makeControl(badLong));
      expect(result!["invalidChars"]).toBe(true);
      expect(result!["tooLong"]).toBe(true);
    });
  });

  describe("validate (instance method)", () => {
    it("delegates to the static method", () => {
      const directive = new UsernameValidationDirective();
      const spy = vi.spyOn(UsernameValidationDirective, "validate");
      const control = makeControl("alice");
      directive.validate(control);
      expect(spy).toHaveBeenCalledWith(control);
    });
  });
});
