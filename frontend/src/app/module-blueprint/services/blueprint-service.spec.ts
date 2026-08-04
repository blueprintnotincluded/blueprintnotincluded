import { BlueprintService, BlueprintFileType } from "./blueprint-service";
import { Blueprint } from "../../../../../lib/index";
import { of, throwError } from "rxjs";

describe("BlueprintService", () => {
  let service: BlueprintService;
  let mockHttp: any;
  let mockAuth: any;
  let mockLocation: any;
  let mockContentLocale: any;

  beforeEach(() => {
    mockHttp = { get: vi.fn(), post: vi.fn() };
    mockAuth = { isLoggedIn: vi.fn(() => false), getToken: vi.fn(() => "") };
    mockLocation = { replaceState: vi.fn() };
    // English reader: appendToUrl is the identity, which is the shape every
    // existing URL assertion below was written against.
    mockContentLocale = { appendToUrl: vi.fn((url: string) => url) };
    service = new BlueprintService(
      mockHttp,
      mockAuth,
      mockLocation,
      mockContentLocale,
    );
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

    it("clears the rating state", () => {
      service.myRating = 4;
      service.rating = 4.5;
      service.nbRatings = 7;
      service.reset();
      expect(service.myRating).toBeNull();
      expect(service.rating).toBe(0);
      expect(service.nbRatings).toBe(0);
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
        service.hashMdb(mdb2 as any),
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
      expect(mockHttp.get).toHaveBeenCalledWith(
        "/api/getblueprint/test-id",
        {},
      );
    });

    it("sends the auth token when logged in, so owners can open their own drafts", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      mockAuth.getToken.mockReturnValue("tok-123");
      mockHttp.get.mockReturnValue(of({ data: null }));
      service.getBlueprint("test-id").subscribe(() => {});
      expect(mockHttp.get).toHaveBeenCalledWith("/api/getblueprint/test-id", {
        headers: { Authorization: "Bearer tok-123" },
      });
    });

    it("maps response fields onto the service when data is present", () => {
      mockHttp.get.mockReturnValue(
        of({
          id: "bp-1",
          name: "My Blueprint",
          nbRatings: 7,
          rating: 4.5,
          myRating: 4,
          data: { blueprintItems: [] },
        }),
      );
      let result: any;
      service.getBlueprint("bp-1").subscribe((bp) => {
        result = bp;
      });
      expect(result).toBeDefined();
      expect(service.id).toBe("bp-1");
      expect(service.name).toBe("My Blueprint");
      expect(service.nbRatings).toBe(7);
      expect(service.rating).toBe(4.5);
      expect(service.myRating).toBe(4);
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
          nbRatings: 0,
          rating: 0,
          myRating: null,
          data: { blueprintItems: [] },
        }),
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
          nbRatings: 0,
          rating: 0,
          myRating: null,
          data: { blueprintItems: [] },
        }),
      );
      obs.blueprintChanged.mockClear();
      service.openBlueprintFromId("test-id");
      expect(obs.blueprintChanged).toHaveBeenCalled();
    });

    it("calls handleGetBlueprintError on http error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockHttp.get.mockReturnValue(
        throwError(() => new Error("network error")),
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
      service.getBlueprints(date, null, null);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("olderthan=" + date.getTime());
    });

    it("omits olderthan on the first page (null cursor) so the URL is cacheable", () => {
      service.getBlueprints(null, null, null);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).not.toContain("olderthan");
      expect(url).not.toContain("?&");
    });

    it("omits olderthan for count sorts, which paginate via skip", () => {
      service.getBlueprints(
        new Date(1_000_000),
        null,
        null,
        null,
        null,
        "popular",
        10,
      );
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).not.toContain("olderthan");
      expect(url).toContain("sort=popular");
      expect(url).toContain("skip=10");
      expect(url).not.toContain("?&");
    });

    it("includes filterUserId when provided", () => {
      service.getBlueprints(new Date(), "user123", null);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("filterUserId=user123");
    });

    it("includes filterName when provided", () => {
      service.getBlueprints(new Date(), null, "my-bp");
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("filterName=my-bp");
    });

    it("a name search paginates by skip and never sends the date cursor", () => {
      // Search results are relevance-ordered, so a createdAt cursor would
      // skip and repeat items; the offset is the only valid pagination.
      service.getBlueprints(
        new Date(1_000_000),
        null,
        "spom",
        null,
        null,
        undefined,
        12,
      );
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).not.toContain("olderthan");
      expect(url).toContain("filterName=spom");
      expect(url).toContain("skip=12");
    });

    it("includes sort=mostForked when provided", () => {
      service.getBlueprints(new Date(), null, null, null, null, "mostForked");
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("sort=mostForked");
    });

    it("uses the public getblueprints for general browsing even when logged in (edge-cacheable)", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.getBlueprints(new Date(), null, null);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("/api/getblueprints?");
      expect(mockHttp.get.mock.calls[0][1]).toBeUndefined();
    });

    it("uses getblueprintsSecure when logged in and listing a specific user", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.getBlueprints(new Date(), "user123", null);
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("getblueprintsSecure");
    });

    it("uses getblueprintsSecure when logged in and listing rated-by-me", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.getBlueprints(
        new Date(),
        null,
        null,
        null,
        null,
        undefined,
        undefined,
        null,
        null,
        "user123",
      );
      const url: string = mockHttp.get.mock.calls[0][0];
      expect(url).toContain("getblueprintsSecure");
    });

    it("uses getblueprints when not logged in", () => {
      mockAuth.isLoggedIn.mockReturnValue(false);
      service.getBlueprints(new Date(), null, null);
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
        expect.any(Object),
      );
    });

    it("never mutates service.id, even if the response carries one", () => {
      service.id = "original-id";
      mockHttp.post.mockReturnValue(of({ id: "deleted-id" }));
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
        expect.any(Object),
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

    it("sends sourceBlueprintId when the editor started from an existing blueprint", () => {
      service.id = "source-bp-id";
      mockHttp.post.mockReturnValue(of({ id: "copy-id" }));
      service.saveBlueprint(false).subscribe(() => {});
      const body = mockHttp.post.mock.calls[0][1];
      expect(body.sourceBlueprintId).toBe("source-bp-id");
    });

    it("omits sourceBlueprintId for a brand-new blueprint", () => {
      service.id = null;
      mockHttp.post.mockReturnValue(of({}));
      service.saveBlueprint(false).subscribe(() => {});
      const body = mockHttp.post.mock.calls[0][1];
      expect(body.sourceBlueprintId).toBeUndefined();
    });
  });

  describe("rateBlueprint()", () => {
    beforeEach(() => {
      mockHttp.post.mockReturnValue(
        of({ nbRatings: 3, rating: 4, myRating: 5 }),
      );
    });

    it("calls http.post with the rateblueprint endpoint and correct body", () => {
      service.rateBlueprint("bp-1", 5).subscribe();
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/rateblueprint",
        { blueprintId: "bp-1", rating: 5 },
        expect.any(Object),
      );
    });

    it("returns the fresh aggregate from the server", () => {
      let result: any;
      service.rateBlueprint("bp-1", 5).subscribe((r) => (result = r));
      expect(result).toEqual({ nbRatings: 3, rating: 4, myRating: 5 });
    });
  });

  describe("trackDownload()", () => {
    it("posts the download beacon anonymously when logged out", () => {
      mockHttp.post.mockReturnValue(of({}));
      service.trackDownload("bp-1");
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/blueprints/bp-1/downloads",
        {},
        {},
      );
    });

    it("sends the auth token when logged in", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      mockAuth.getToken.mockReturnValue("tok");
      mockHttp.post.mockReturnValue(of({}));
      service.trackDownload("bp-1");
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/blueprints/bp-1/downloads",
        {},
        { headers: { Authorization: "Bearer tok" } },
      );
    });

    it("swallows beacon errors silently", () => {
      mockHttp.post.mockReturnValue(throwError(() => new Error("boom")));
      expect(() => service.trackDownload("bp-1")).not.toThrow();
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
        () => {},
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
    it("sets name from the BNI blueprint friendlyname", async () => {
      const json = JSON.stringify({
        friendlyname: "My JSON Blueprint",
        buildings: [],
        digcommands: [],
      });
      await (service as any).loadJsonBlueprint(json);
      expect(service.name).toBe("My JSON Blueprint");
    });

    it("notifies observers with a Blueprint instance", async () => {
      const obs = { blueprintChanged: vi.fn() };
      service.subscribeBlueprintChanged(obs);
      obs.blueprintChanged.mockClear();
      const json = JSON.stringify({
        friendlyname: "Test",
        buildings: [],
        digcommands: [],
      });
      await (service as any).loadJsonBlueprint(json);
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

  describe("BlueprintsV2 raw source round-trip", () => {
    const BNI_JSON = JSON.stringify({
      blueprintVersion: 3,
      friendlyname: "Imported",
      userdesc: "a description from the mod",
      buildings: [],
      digcommands: [],
    });

    it("keeps the verbatim import text and format after a JSON import", async () => {
      await service.openBlueprintFromShareString(BNI_JSON);
      expect(service.rawSource).toBe(BNI_JSON);
      expect(service.rawSourceFormat).toBe("bpv2-json");
    });

    it("prefills metadata.description from userdesc", async () => {
      await service.openBlueprintFromShareString(BNI_JSON);
      expect(service.metadata.description).toBe("a description from the mod");
    });

    it("rejects text that is neither JSON nor a share-string", async () => {
      await expect(
        service.openBlueprintFromShareString("not a blueprint at all"),
      ).rejects.toThrow();
    });

    it("leaves the current session state untouched when the paste is invalid", async () => {
      service.id = "open-blueprint";
      service.metadata = { description: "existing" };
      await expect(
        service.openBlueprintFromShareString("not a blueprint at all"),
      ).rejects.toThrow();
      expect(service.id).toBe("open-blueprint");
      expect(service.metadata.description).toBe("existing");
    });

    it("notifies import-error observers when a file upload fails to parse", async () => {
      const onError = vi.fn();
      service.subscribeImportError(onError);
      const reader = {
        readAsText: vi.fn(),
        onloadend: null as null | (() => void),
        result: "garbage that is not a blueprint",
      };
      vi.stubGlobal(
        "FileReader",
        vi.fn(() => reader),
      );
      (service as any).openJsonBlueprint({} as File);
      reader.onloadend!();
      await vi.waitFor(() => expect(onError).toHaveBeenCalled());
      vi.unstubAllGlobals();
    });

    it("getValidRawSource returns the import while content is unedited", async () => {
      await service.openBlueprintFromShareString(BNI_JSON);
      expect(service.getValidRawSource()).toEqual({
        text: BNI_JSON,
        format: "bpv2-json",
      });
    });

    it("getValidRawSource returns null once the blueprint diverges", async () => {
      await service.openBlueprintFromShareString(BNI_JSON);
      vi.spyOn(service.blueprint, "toMdbBlueprint").mockReturnValue({
        blueprintItems: [{ id: "Tile" }],
      } as any);
      expect(service.getValidRawSource()).toBeNull();
    });

    it("getValidRawSource returns null when nothing was imported", () => {
      expect(service.getValidRawSource()).toBeNull();
    });

    // Regression for spec/element-notes.md §1.2 / blueprintsv2-followups.md
    // item 1: world notes now flow through toMdbBlueprint, so editing one
    // correctly detaches the byte-exact raw source (it previously did not).
    // The real app applies an import onto the live blueprint via
    // component-canvas's loadNewBlueprint -> destroyAndCopyItems; reproduce
    // that here since this spec has no canvas subscriber wired up.
    it("editing a world note invalidates the held raw source", async () => {
      service.subscribeBlueprintChanged({
        blueprintChanged: (blueprint) =>
          service.blueprint.destroyAndCopyItems(blueprint),
      });
      const bniWithNote = JSON.stringify({
        blueprintVersion: 3,
        friendlyname: "Imported",
        buildings: [],
        digcommands: [],
        worldNotes: [{ x: 0, y: 0, type: 1, id: 1, mass: 100, temp: 300 }],
      });
      await service.openBlueprintFromShareString(bniWithNote);
      expect(service.blueprint.worldNotes).toHaveLength(1);
      expect(service.getValidRawSource()).not.toBeNull();

      service.blueprint.worldNotes[0].mass = 200;
      expect(service.getValidRawSource()).toBeNull();
    });

    it("saveBlueprint sends rawSource only while the import is unedited", async () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      mockHttp.post.mockReturnValue(of({ id: "new-id" }));
      await service.openBlueprintFromShareString(BNI_JSON);

      service.saveBlueprint(false).subscribe();
      const body = mockHttp.post.mock.calls[0][1];
      expect(body.rawSource).toBe(BNI_JSON);
      expect(body.rawSourceFormat).toBe("bpv2-json");
      expect(service.serverHasRawSource).toBe(true);
    });

    it("saveBlueprint omits rawSource for edited content", async () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      mockHttp.post.mockReturnValue(of({ id: "new-id" }));
      await service.openBlueprintFromShareString(BNI_JSON);
      vi.spyOn(service.blueprint, "toMdbBlueprint").mockReturnValue({
        blueprintItems: [{ id: "Tile" }],
      } as any);

      service.saveBlueprint(false).subscribe();
      const body = mockHttp.post.mock.calls[0][1];
      expect(body.rawSource).toBeUndefined();
      expect(body.rawSourceFormat).toBeUndefined();
      expect(service.serverHasRawSource).toBe(false);
    });

    it("reset clears the held raw source", async () => {
      await service.openBlueprintFromShareString(BNI_JSON);
      service.reset();
      expect(service.rawSource).toBeNull();
      expect(service.getValidRawSource()).toBeNull();
    });
  });

  describe("downloadBlueprintFile()", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("serves the server's raw copy byte-exact when available", () => {
      const saveSpy = vi
        .spyOn(BlueprintService, "saveTextFile")
        .mockImplementation(() => {});
      mockHttp.get.mockImplementation((url: string) =>
        url.endsWith("/raw")
          ? of("RAW-TEXT")
          : of({ hasRawSource: true, rawSourceFormat: "bpv2-json" }),
      );

      service.downloadBlueprintFile("bp1", "My Blueprint").subscribe();

      expect(mockHttp.get).toHaveBeenCalledWith("/api/blueprints/bp1/raw", {
        responseType: "text",
      });
      expect(saveSpy).toHaveBeenCalledWith(
        "RAW-TEXT",
        "My Blueprint.blueprint",
      );
      // The raw endpoint records the download server-side — no beacon
      expect(mockHttp.post).not.toHaveBeenCalled();
    });

    it("uses a .txt extension for share-string raws", () => {
      const saveSpy = vi
        .spyOn(BlueprintService, "saveTextFile")
        .mockImplementation(() => {});
      mockHttp.get.mockImplementation((url: string) =>
        url.endsWith("/raw")
          ? of("SHARE-STRING")
          : of({ hasRawSource: true, rawSourceFormat: "bpv2-sharestring" }),
      );

      service.downloadBlueprintFile("bp1", "My Blueprint").subscribe();

      expect(saveSpy).toHaveBeenCalledWith("SHARE-STRING", "My Blueprint.txt");
    });

    it("falls back to generating the file when the raw fetch fails", () => {
      const saveSpy = vi
        .spyOn(BlueprintService, "saveTextFile")
        .mockImplementation(() => {});
      mockHttp.post.mockReturnValue(of({}));
      mockHttp.get.mockImplementation((url: string) =>
        url.endsWith("/raw")
          ? throwError(() => new Error("404"))
          : of({
              hasRawSource: true,
              rawSourceFormat: "bpv2-json",
              data: { blueprintItems: [] },
            }),
      );

      service.downloadBlueprintFile("bp1", "My Blueprint").subscribe();

      expect(saveSpy).toHaveBeenCalledWith(
        expect.stringContaining("friendlyname"),
        "My Blueprint.blueprint",
      );
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/blueprints/bp1/downloads",
        {},
        expect.anything(),
      );
    });

    it("generates the file from parsed data when no raw is stored", () => {
      const saveSpy = vi
        .spyOn(BlueprintService, "saveTextFile")
        .mockImplementation(() => {});
      mockHttp.post.mockReturnValue(of({}));
      mockHttp.get.mockReturnValue(
        of({ hasRawSource: false, data: { blueprintItems: [] } }),
      );

      service.downloadBlueprintFile("bp1", "My Blueprint").subscribe();

      expect(saveSpy).toHaveBeenCalledWith(
        expect.stringContaining("friendlyname"),
        "My Blueprint.blueprint",
      );
      // Client-side generation reports the download via the beacon
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/blueprints/bp1/downloads",
        {},
        expect.anything(),
      );
    });
  });

  describe("exportBlueprintFile()", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("serves the held raw import when the blueprint is unedited", async () => {
      const saveSpy = vi
        .spyOn(BlueprintService, "saveTextFile")
        .mockImplementation(() => {});
      const json = JSON.stringify({ friendlyname: "T", buildings: [] });
      await service.openBlueprintFromShareString(json);

      service.exportBlueprintFile("T");

      expect(saveSpy).toHaveBeenCalledWith(json, "T.blueprint");
    });

    it("generates from the parsed model when there is no raw", () => {
      const saveSpy = vi
        .spyOn(BlueprintService, "saveTextFile")
        .mockImplementation(() => {});

      service.exportBlueprintFile("Fresh");

      expect(saveSpy).toHaveBeenCalledWith(
        expect.stringContaining("friendlyname"),
        "Fresh.blueprint",
      );
    });
  });
});
