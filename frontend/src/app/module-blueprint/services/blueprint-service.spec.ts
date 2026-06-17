import { BlueprintService, BlueprintFileType } from "./blueprint-service";
import { Blueprint } from "../../../../../lib/index";
import { of, throwError } from "rxjs";

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

  describe("handleGetBlueprintError()", () => {
    it("logs the error to console.error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      service.handleGetBlueprintError("some-error");
      expect(spy).toHaveBeenCalledWith("some-error");
      spy.mockRestore();
    });
  });

  describe("reloadUndoIndex()", () => {
    it("does not throw when restoring a state", () => {
      service.blueprintChanged();
      service.undoIndex = 0;
      expect(() => (service as any).reloadUndoIndex()).not.toThrow();
    });

    it("sets suppressChanges back to false after restoring", () => {
      service.blueprintChanged();
      service.undoIndex = 0;
      (service as any).reloadUndoIndex();
      expect(service.suppressChanges).toBe(false);
    });
  });

  describe("getBlueprint()", () => {
    it("calls http.get with the correct URL", () => {
      mockHttp.get.mockReturnValue(of({ data: null }));
      service.getBlueprint("test-id").subscribe(() => {});
      expect(mockHttp.get).toHaveBeenCalledWith("/api/getblueprint/test-id");
    });

    it("maps response fields onto the service when data is present", () => {
      mockHttp.get.mockReturnValue(
        of({
          id: "bp-1",
          name: "My Blueprint",
          likedByMe: true,
          nbLikes: 7,
          data: { blueprintItems: [] },
        })
      );
      let result: any;
      service.getBlueprint("bp-1").subscribe((bp) => {
        result = bp;
      });
      expect(result).toBeDefined();
      expect(service.id).toBe("bp-1");
      expect(service.name).toBe("My Blueprint");
      expect(service.likedByMe).toBe(true);
      expect(service.nbLikes).toBe(7);
    });

    it("returns undefined when response has no data", () => {
      mockHttp.get.mockReturnValue(of({ data: null }));
      let result: any = "sentinel";
      service.getBlueprint("bp-1").subscribe((bp) => {
        result = bp;
      });
      expect(result).toBeUndefined();
    });
  });

  describe("openBlueprintFromId()", () => {
    it("calls replaceState with /b/<id>", () => {
      mockHttp.get.mockReturnValue(
        of({
          id: "test-id",
          name: "Test",
          likedByMe: false,
          nbLikes: 0,
          data: { blueprintItems: [] },
        })
      );
      service.openBlueprintFromId("test-id");
      expect(mockLocation.replaceState).toHaveBeenCalledWith("/b/test-id");
    });

    it("notifies observers when blueprint loads successfully", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      mockHttp.get.mockReturnValue(
        of({
          id: "test-id",
          name: "Test",
          likedByMe: false,
          nbLikes: 0,
          data: { blueprintItems: [] },
        })
      );
      obs.blueprintChanged.mockClear();
      service.openBlueprintFromId("test-id");
      expect(obs.blueprintChanged).toHaveBeenCalled();
    });

    it("calls handleGetBlueprintError on http error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockHttp.get.mockReturnValue(
        throwError(() => new Error("network error"))
      );
      service.openBlueprintFromId("bad-id");
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe("loadUrlBlueprint()", () => {
    it("calls http.get with the given url", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockHttp.get.mockReturnValue(of("response-value"));
      service.loadUrlBlueprint("/some/url");
      expect(mockHttp.get).toHaveBeenCalledWith("/some/url");
      spy.mockRestore();
    });

    it("logs the response value to console.warn", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockHttp.get.mockReturnValue(of("response-value"));
      service.loadUrlBlueprint("/some/url");
      expect(spy).toHaveBeenCalledWith("response-value");
      spy.mockRestore();
    });
  });

  describe("getBlueprints()", () => {
    beforeEach(() => {
      mockHttp.get.mockReturnValue(of([]));
    });

    it("includes olderthan in the query string", () => {
      const date = new Date(1_000_000);
      service.getBlueprints(date, null, null, false);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("olderthan=" + date.getTime());
    });

    it("includes filterUserId when provided", () => {
      service.getBlueprints(new Date(), "user123", null, false);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("filterUserId=user123");
    });

    it("includes filterName when provided", () => {
      service.getBlueprints(new Date(), null, "my-bp", false);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("filterName=my-bp");
    });

    it("includes getDuplicates when true", () => {
      service.getBlueprints(new Date(), null, null, true);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("getDuplicates=true");
    });

    it("uses getblueprintsSecure when logged in", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.getBlueprints(new Date(), null, null, false);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("getblueprintsSecure");
    });

    it("uses getblueprints when not logged in", () => {
      mockAuth.isLoggedIn.mockReturnValue(false);
      service.getBlueprints(new Date(), null, null, false);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("/api/getblueprints?");
    });
  });

  describe("deleteBlueprint()", () => {
    it("calls http.post with the correct URL and body", () => {
      mockHttp.post.mockReturnValue(of({}));
      service.deleteBlueprint("bp-to-delete").subscribe(() => {});
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/deleteblueprint",
        { blueprintId: "bp-to-delete" },
        expect.any(Object)
      );
    });

    it("sets service.id from response.id when provided", () => {
      mockHttp.post.mockReturnValue(of({ id: "deleted-id" }));
      service.deleteBlueprint("bp-1").subscribe(() => {});
      expect(service.id).toBe("deleted-id");
    });

    it("does not change service.id when response has no id", () => {
      service.id = "original-id";
      mockHttp.post.mockReturnValue(of({}));
      service.deleteBlueprint("bp-1").subscribe(() => {});
      expect(service.id).toBe("original-id");
    });
  });

  describe("saveBlueprint()", () => {
    it("calls http.post with the uploadblueprint URL", () => {
      mockHttp.post.mockReturnValue(of({}));
      service.saveBlueprint(false).subscribe(() => {});
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/uploadblueprint",
        expect.any(Object),
        expect.any(Object)
      );
    });

    it("sets service.id and calls replaceState when response has id", () => {
      mockHttp.post.mockReturnValue(of({ id: "new-saved-id" }));
      service.saveBlueprint(true).subscribe(() => {});
      expect(service.id).toBe("new-saved-id");
      expect(mockLocation.replaceState).toHaveBeenCalledWith("/b/new-saved-id");
    });

    it("passes overwrite flag in the request body", () => {
      mockHttp.post.mockReturnValue(of({}));
      service.saveBlueprint(true).subscribe(() => {});
      const body = mockHttp.post.mock.calls[0][1];
      expect(body.overwrite).toBe(true);
    });
  });

  describe("likeBlueprint()", () => {
    beforeEach(() => {
      mockHttp.post.mockReturnValue(of({}));
    });

    it("toggles likedByMe from false to true", () => {
      service.likedByMe = false;
      service.likeBlueprint("bp-1", true);
      expect(service.likedByMe).toBe(true);
    });

    it("toggles likedByMe from true to false", () => {
      service.likedByMe = true;
      service.likeBlueprint("bp-1", false);
      expect(service.likedByMe).toBe(false);
    });

    it("calls http.post with the likeblueprint endpoint and correct body", () => {
      service.likeBlueprint("bp-1", true);
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/likeblueprint",
        { blueprintId: "bp-1", like: true },
        expect.any(Object)
      );
    });
  });

  describe("openBlueprintFromUpload()", () => {
    it("does nothing when fileList is empty", () => {
      const spy = vi.spyOn(service as any, "openYamlBlueprint");
      service.openBlueprintFromUpload(BlueprintFileType.YAML, {
        length: 0,
      } as any);
      expect(spy).not.toHaveBeenCalled();
    });

    it("calls openYamlBlueprint for YAML file type", () => {
      const spy = vi
        .spyOn(service as any, "openYamlBlueprint")
        .mockImplementation(() => {});
      const mockFile = {} as File;
      service.openBlueprintFromUpload(BlueprintFileType.YAML, {
        length: 1,
        0: mockFile,
      } as any);
      expect(spy).toHaveBeenCalledWith(mockFile);
    });

    it("calls openJsonBlueprint for JSON file type", () => {
      const spy = vi
        .spyOn(service as any, "openJsonBlueprint")
        .mockImplementation(() => {});
      const mockFile = {} as File;
      service.openBlueprintFromUpload(BlueprintFileType.JSON, {
        length: 1,
        0: mockFile,
      } as any);
      expect(spy).toHaveBeenCalledWith(mockFile);
    });

    it("calls openBsonBlueprint for BSON file type", () => {
      const spy = vi
        .spyOn(service as any, "openBsonBlueprint")
        .mockImplementation(() => {});
      const mockFile = {} as File;
      service.openBlueprintFromUpload(BlueprintFileType.BSON, {
        length: 1,
        0: mockFile,
      } as any);
      expect(spy).toHaveBeenCalledWith(mockFile);
    });

    it("calls resetUndoStates after dispatching to the format handler", () => {
      vi.spyOn(service as any, "openYamlBlueprint").mockImplementation(
        () => {}
      );
      const resetSpy = vi.spyOn(service, "resetUndoStates");
      service.openBlueprintFromUpload(BlueprintFileType.YAML, {
        length: 1,
        0: {} as File,
      } as any);
      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe("loadJsonBlueprint()", () => {
    it("sets name from the BNI blueprint friendlyname", () => {
      const json = JSON.stringify({
        friendlyname: "My JSON Blueprint",
        buildings: [],
        digcommands: [],
      });
      (service as any).loadJsonBlueprint(json);
      expect(service.name).toBe("My JSON Blueprint");
    });

    it("notifies observers with a Blueprint instance", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      obs.blueprintChanged.mockClear();
      const json = JSON.stringify({
        friendlyname: "Test",
        buildings: [],
        digcommands: [],
      });
      (service as any).loadJsonBlueprint(json);
      expect(obs.blueprintChanged).toHaveBeenCalled();
    });
  });

  describe("loadYamlBlueprint()", () => {
    it("sets name from the ONI template name field", () => {
      const yamlStr = "name: My YAML Blueprint\nbuildings: []\ncells: []";
      (service as any).loadYamlBlueprint(yamlStr);
      expect(service.name).toBe("My YAML Blueprint");
    });

    it("notifies observers with a Blueprint instance", () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      obs.blueprintChanged.mockClear();
      const yamlStr = "name: Test\nbuildings: []\ncells: []";
      (service as any).loadYamlBlueprint(yamlStr);
      expect(obs.blueprintChanged).toHaveBeenCalled();
    });
  });
});
