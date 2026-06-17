import { BlueprintService } from "./blueprint-service";
import { Blueprint } from "../../../../../lib/index";

describe("BlueprintService", () => {
  let service: BlueprintService;
  let mockHttp: any;
  let mockAuth: any;
  let mockLocation: any;

  beforeEach(() => {
    mockHttp = { get: vi.fn(), post: vi.fn() };
    mockAuth = { isLoggedIn: vi.fn(() => false), getToken: vi.fn(() => "") };
    mockLocation = { replaceState: vi.fn() };
    service = new BlueprintService(mockHttp, mockAuth, mockLocation);
  });

  describe("savedBlueprint getter", () => {
    it("returns false when id is null", () => {
      expect(service.savedBlueprint).toBe(false);
    });

    it("returns true when id is set", () => {
      service.id = "abc123";
      expect(service.savedBlueprint).toBe(true);
    });
  });

  describe("reset()", () => {
    it("clears id to null", () => {
      service.id = "some-id";
      service.reset();
      expect(service.id).toBeNull();
    });

    it("clears likedByMe to false", () => {
      service.likedByMe = true;
      service.reset();
      expect(service.likedByMe).toBe(false);
    });
  });

  describe("subscribeBlueprintChanged / unsubscribeBlueprintChanged", () => {
    it("adds an observer", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      expect(service.observersBlueprintChanged).toContain(obs);
    });

    it("removes an existing observer", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      service.unsubscribeBlueprintChanged(obs);
      expect(service.observersBlueprintChanged).not.toContain(obs);
    });

    it("does not throw when unsubscribing an observer that was never added", () => {
      const obs = { blueprintChanged: vi.fn() };
      expect(() => service.unsubscribeBlueprintChanged(obs)).not.toThrow();
    });
  });

  describe("blueprintChanged()", () => {
    it("starts with one undo state after construction", () => {
      expect(service.undoStates.length).toBe(1);
      expect(service.undoIndex).toBe(0);
    });

    it("pushes a new snapshot to undoStates", () => {
      const before = service.undoStates.length;
      service.blueprintChanged();
      expect(service.undoStates.length).toBe(before + 1);
    });

    it("advances undoIndex to the last state", () => {
      service.blueprintChanged();
      expect(service.undoIndex).toBe(service.undoStates.length - 1);
    });

    it("does nothing when suppressChanges is true", () => {
      const before = service.undoStates.length;
      service.suppressChanges = true;
      service.blueprintChanged();
      expect(service.undoStates.length).toBe(before);
    });

    it("caps history at 50 states", () => {
      for (let i = 0; i < 60; i++) service.blueprintChanged();
      expect(service.undoStates.length).toBeLessThanOrEqual(50);
    });

    it("scraps future redo states when a change is made mid-stack", () => {
      service.blueprintChanged(); // [0, 1], index 1
      service.blueprintChanged(); // [0, 1, 2], index 2
      service.undoIndex = 0; // simulate position after undo
      service.blueprintChanged(); // splices states[1..], pushes new: [0, new]
      expect(service.undoStates.length).toBe(2);
    });
  });

  describe("undo()", () => {
    it("does nothing when undoIndex is already 0", () => {
      expect(service.undoIndex).toBe(0);
      service.undo();
      expect(service.undoIndex).toBe(0);
    });

    it("decrements undoIndex by 1", () => {
      service.blueprintChanged(); // [0, 1], index 1
      service.undo();
      expect(service.undoIndex).toBe(0);
    });
  });

  describe("redo()", () => {
    it("does nothing when undoIndex is at the last state", () => {
      const before = service.undoIndex;
      service.redo();
      expect(service.undoIndex).toBe(before);
    });

    it("increments undoIndex by 1 after an undo", () => {
      service.blueprintChanged(); // [0, 1], index 1
      service.undo(); // index 0
      service.redo(); // index 1
      expect(service.undoIndex).toBe(1);
    });

    it("does not advance past the last state", () => {
      service.blueprintChanged(); // [0, 1], index 1
      service.redo(); // already at end, stays 1
      service.redo();
      expect(service.undoIndex).toBe(service.undoStates.length - 1);
    });
  });

  describe("resetUndoStates()", () => {
    it("clears suppressChanges", () => {
      service.suppressChanges = true;
      service.resetUndoStates();
      expect(service.suppressChanges).toBe(false);
    });

    it("leaves exactly one undo state", () => {
      service.blueprintChanged();
      service.blueprintChanged();
      service.resetUndoStates();
      expect(service.undoStates.length).toBe(1);
    });

    it("resets undoIndex to 0", () => {
      service.blueprintChanged();
      service.blueprintChanged();
      service.resetUndoStates();
      expect(service.undoIndex).toBe(0);
    });
  });

  describe("hashMdb()", () => {
    it("returns the same value for identical objects", () => {
      const mdb = { blueprintItems: [] };
      expect(service.hashMdb(mdb as any)).toBe(service.hashMdb(mdb as any));
    });

    it("returns the same value for structurally equal objects", () => {
      const mdb1 = { blueprintItems: [] };
      const mdb2 = { blueprintItems: [] };
      expect(service.hashMdb(mdb1 as any)).toBe(service.hashMdb(mdb2 as any));
    });

    it("returns different values for structurally different objects", () => {
      const mdb1 = { blueprintItems: [] };
      const mdb2 = { blueprintItems: [{ id: "Wire" }] };
      expect(service.hashMdb(mdb1 as any)).not.toBe(
        service.hashMdb(mdb2 as any)
      );
    });
  });

  describe("newBlueprint()", () => {
    it("sets name to 'new blueprint'", () => {
      service.newBlueprint();
      expect(service.name).toBe("new blueprint");
    });

    it("calls location.replaceState('/')", () => {
      service.newBlueprint();
      expect(mockLocation.replaceState).toHaveBeenCalledWith("/");
    });

    it("notifies observers with a new Blueprint instance", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      service.newBlueprint();
      expect(obs.blueprintChanged).toHaveBeenCalledWith(expect.any(Blueprint));
    });

    it("resets the undo stack to one state", () => {
      service.blueprintChanged();
      service.blueprintChanged();
      service.newBlueprint();
      expect(service.undoStates.length).toBe(1);
    });

    it("clears id via reset()", () => {
      service.id = "old-id";
      service.newBlueprint();
      expect(service.id).toBeNull();
    });
  });

  describe("handleGetBlueprint()", () => {
    it("does nothing when blueprint is undefined", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      service.handleGetBlueprint(undefined);
      expect(obs.blueprintChanged).not.toHaveBeenCalled();
    });

    it("notifies observers with the provided blueprint", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      const bp = new Blueprint();
      service.handleGetBlueprint(bp);
      expect(obs.blueprintChanged).toHaveBeenCalledWith(bp);
    });

    it("resets the undo stack to one state after loading", () => {
      service.blueprintChanged();
      service.blueprintChanged();
      service.handleGetBlueprint(new Blueprint());
      expect(service.undoStates.length).toBe(1);
    });
  });
});
