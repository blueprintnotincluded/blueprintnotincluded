import {
  chordEquals,
  chordFromEvent,
  formatChord,
  formatCode,
  formatSerializedChord,
  isModifierCode,
  makeChord,
  parseChord,
  serializeChord,
} from "./key-chord";

const keyEvent = (init: Partial<KeyboardEventInit> & { code: string }) =>
  new KeyboardEvent("keydown", init);

describe("key-chord", () => {
  describe("chordFromEvent", () => {
    it("captures the physical code and every modifier", () => {
      const chord = chordFromEvent(
        keyEvent({ code: "KeyZ", ctrlKey: true, shiftKey: true }),
      );
      expect(chord).toEqual({
        code: "KeyZ",
        ctrl: true,
        alt: false,
        shift: true,
        meta: false,
      });
    });

    // Otherwise a rebind would "capture" Shift while the user is still
    // reaching for the key they actually want.
    it("returns null for a bare modifier press", () => {
      expect(chordFromEvent(keyEvent({ code: "ShiftLeft" }))).toBeNull();
      expect(chordFromEvent(keyEvent({ code: "ControlRight" }))).toBeNull();
    });

    it("returns null when the event carries no code", () => {
      expect(chordFromEvent(keyEvent({ code: "" }))).toBeNull();
    });
  });

  describe("serialize / parse round trip", () => {
    it("round trips a plain key", () => {
      const chord = makeChord("KeyW");
      expect(serializeChord(chord)).toBe("KeyW");
      expect(parseChord("KeyW")).toEqual(chord);
    });

    it("round trips a modified key in a fixed modifier order", () => {
      const chord = makeChord("KeyZ", { ctrl: true, shift: true });
      expect(serializeChord(chord)).toBe("Ctrl+Shift+KeyZ");
      expect(parseChord("Ctrl+Shift+KeyZ")).toEqual(chord);
    });

    it("parses modifiers written in any order or case", () => {
      expect(parseChord("shift+ctrl+KeyZ")).toEqual(
        makeChord("KeyZ", { ctrl: true, shift: true }),
      );
    });

    it("accepts the Mac spellings of Meta", () => {
      expect(parseChord("Cmd+KeyS")).toEqual(makeChord("KeyS", { meta: true }));
      expect(parseChord("Command+KeyS")).toEqual(
        makeChord("KeyS", { meta: true }),
      );
    });

    it("rejects strings it did not write", () => {
      expect(parseChord("")).toBeNull();
      expect(parseChord("Hyper+KeyZ")).toBeNull();
      expect(parseChord("ShiftLeft")).toBeNull();
    });
  });

  describe("chordEquals", () => {
    it("compares the code and every modifier", () => {
      expect(chordEquals(makeChord("KeyA"), makeChord("KeyA"))).toBe(true);
      expect(chordEquals(makeChord("KeyA"), makeChord("KeyB"))).toBe(false);
      expect(
        chordEquals(makeChord("KeyA"), makeChord("KeyA", { shift: true })),
      ).toBe(false);
    });
  });

  describe("formatCode", () => {
    it("strips the Key/Digit prefixes", () => {
      expect(formatCode("KeyW")).toBe("W");
      expect(formatCode("Digit1")).toBe("1");
    });

    it("uses the printed label for punctuation and named keys", () => {
      expect(formatCode("Minus")).toBe("-");
      expect(formatCode("Equal")).toBe("=");
      expect(formatCode("Escape")).toBe("Esc");
      expect(formatCode("ArrowUp")).toBe("↑");
      expect(formatCode("NumpadAdd")).toBe("Num +");
    });

    it("labels numpad keys that have no explicit entry", () => {
      expect(formatCode("Numpad5")).toBe("Num 5");
    });

    it("falls back to the raw code", () => {
      expect(formatCode("F7")).toBe("F7");
      expect(formatCode("SomethingExotic")).toBe("SomethingExotic");
    });
  });

  describe("formatChord", () => {
    it("spells modifiers out on non-Apple platforms", () => {
      expect(formatChord(makeChord("KeyZ", { ctrl: true }))).toBe("Ctrl + Z");
    });

    it("uses the Mac symbols when asked", () => {
      expect(formatChord(makeChord("KeyS", { meta: true }), true)).toBe("⌘S");
      expect(
        formatChord(makeChord("KeyZ", { meta: true, shift: true }), true),
      ).toBe("⇧⌘Z");
    });
  });

  describe("formatSerializedChord", () => {
    it("formats a stored chord", () => {
      expect(formatSerializedChord("Ctrl+KeyY")).toBe("Ctrl + Y");
    });

    it("passes unparseable input through untouched", () => {
      expect(formatSerializedChord("Hyper+KeyZ")).toBe("Hyper+KeyZ");
    });
  });

  describe("isModifierCode", () => {
    it("knows both sides of each modifier", () => {
      expect(isModifierCode("ShiftLeft")).toBe(true);
      expect(isModifierCode("MetaRight")).toBe(true);
      expect(isModifierCode("KeyA")).toBe(false);
    });
  });
});
