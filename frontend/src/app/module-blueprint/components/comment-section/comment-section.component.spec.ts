import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { of, throwError } from "rxjs";

import { CommentSectionComponent } from "./comment-section.component";
import { CommentService } from "../../services/comment.service";
import { AuthenticationService } from "../../services/authentification-service";
import { TranslationService } from "../../services/translation.service";

function makeComment(overrides: any = {}) {
  return {
    id: "c1",
    parentId: null,
    author: { id: "u1", username: "alice" },
    segments: [{ type: "text", text: "nice build" }],
    deleted: false,
    createdAt: new Date("2026-07-01").toISOString(),
    lastActivityAt: new Date("2026-07-01").toISOString(),
    editedAt: null,
    sourceLang: null,
    canDelete: false,
    canEdit: false,
    ...overrides,
  };
}

describe("CommentSectionComponent", () => {
  let component: CommentSectionComponent;
  let fixture: ComponentFixture<CommentSectionComponent>;
  let commentService: any;
  let authService: any;
  let translationService: any;

  function bindBlueprint(id: string | null) {
    component.blueprintId = id;
    component.ngOnChanges();
  }

  beforeEach(async () => {
    commentService = {
      getComments: vi
        .fn()
        .mockReturnValue(
          of({ threads: [{ comment: makeComment(), replies: [] }], total: 1 }),
        ),
      postComment: vi.fn().mockReturnValue(of({ comment: makeComment() })),
      editComment: vi.fn().mockReturnValue(of({ comment: makeComment() })),
      deleteComment: vi.fn().mockReturnValue(of({ delete: "OK" })),
    };
    authService = { isLoggedIn: vi.fn().mockReturnValue(true) };
    translationService = {
      matchesViewerLang: vi.fn().mockReturnValue(true),
      translateComments: vi.fn().mockReturnValue(of({ translations: [] })),
      cachedComment: vi.fn().mockReturnValue(null),
    };

    await TestBed.configureTestingModule({
      declarations: [CommentSectionComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: CommentService, useValue: commentService },
        { provide: AuthenticationService, useValue: authService },
        { provide: TranslationService, useValue: translationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommentSectionComponent);
    component = fixture.componentInstance;
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  describe("blueprintId binding", () => {
    it("loads comments when the blueprint id is bound", () => {
      bindBlueprint("bp1");

      expect(commentService.getComments).toHaveBeenCalledWith("bp1");
      expect(component.threads).toHaveLength(1);
      expect(component.total).toBe(1);
      expect(component.loading).toBe(false);
    });

    it("gives each comment a stable anchor id and emits commentsLoaded", () => {
      const emitSpy = vi.fn();
      component.commentsLoaded.subscribe(emitSpy);

      bindBlueprint("bp1");
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector("#comment-c1")).toBeTruthy();
      expect(emitSpy).toHaveBeenCalled();
    });

    it("does nothing without a blueprint id", () => {
      bindBlueprint(null);
      expect(commentService.getComments).not.toHaveBeenCalled();
    });

    it("flags a load error on failure", () => {
      commentService.getComments.mockReturnValue(
        throwError(() => new Error("boom")),
      );
      bindBlueprint("bp1");

      expect(component.loadError).toBe(true);
      expect(component.loading).toBe(false);
    });

    it("resets in-progress form state when the blueprint changes", () => {
      bindBlueprint("bp1");
      component.newComment = "draft";
      component.startReply(makeComment({ id: "parent1" }) as any);

      bindBlueprint("bp2");
      expect(component.newComment).toBe("");
      expect(component.replyingTo).toBe(null);
      expect(commentService.getComments).toHaveBeenLastCalledWith("bp2");
    });
  });

  describe("posting", () => {
    beforeEach(() => bindBlueprint("bp1"));

    it("posts a top-level comment, clears the input, and reloads", () => {
      component.newComment = "this breaks in Spaced Out";
      component.postTopLevel();

      expect(commentService.postComment).toHaveBeenCalledWith(
        "bp1",
        "this breaks in Spaced Out",
        undefined,
      );
      expect(component.newComment).toBe("");
      expect(commentService.getComments).toHaveBeenCalledTimes(2);
    });

    it("does not post blank comments", () => {
      component.newComment = "   ";
      component.postTopLevel();
      expect(commentService.postComment).not.toHaveBeenCalled();
    });

    it("posts a reply to the thread being replied to and closes the reply form", () => {
      component.startReply(makeComment({ id: "parent1" }) as any);
      component.replyText = "works for me";
      component.postReply();

      expect(commentService.postComment).toHaveBeenCalledWith(
        "bp1",
        "works for me",
        "parent1",
      );
      expect(component.replyingTo).toBe(null);
      expect(component.replyText).toBe("");
    });

    it("surfaces the API error message when posting fails", () => {
      commentService.postComment.mockReturnValue(
        throwError(() => ({
          error: { errors: [{ status: "429", title: "Too fast" }] },
        })),
      );
      component.newComment = "spam spam";
      component.postTopLevel();

      expect(component.postError).toBe("Too fast");
      expect(component.posting).toBe(false);
    });
  });

  describe("editing", () => {
    beforeEach(() => bindBlueprint("bp1"));

    it("prefills the edit box from editSource and saves through the service", () => {
      component.startEdit(
        makeComment({ canEdit: true, editSource: "hey @alice" }) as any,
      );
      expect(component.editText).toBe("hey @alice");

      component.editText = "hey @alice, updated";
      component.saveEdit();

      expect(commentService.editComment).toHaveBeenCalledWith(
        "c1",
        "hey @alice, updated",
      );
      expect(component.editingId).toBe(null);
      expect(commentService.getComments).toHaveBeenCalledTimes(2);
    });

    it("does not save a blank edit", () => {
      component.startEdit(makeComment({ canEdit: true }) as any);
      component.editText = "   ";
      component.saveEdit();
      expect(commentService.editComment).not.toHaveBeenCalled();
    });

    it("cancelling an edit restores the read view without saving", () => {
      component.startEdit(
        makeComment({ canEdit: true, editSource: "draft" }) as any,
      );
      component.cancelEdit();

      expect(component.editingId).toBe(null);
      expect(component.editText).toBe("");
      expect(commentService.editComment).not.toHaveBeenCalled();
    });

    it("starting a reply closes an open edit and vice versa", () => {
      component.startEdit(makeComment({ id: "c1", canEdit: true }) as any);
      component.startReply(makeComment({ id: "c2" }) as any);
      expect(component.editingId).toBe(null);
      expect(component.replyingTo).toBe("c2");

      component.startEdit(makeComment({ id: "c1", canEdit: true }) as any);
      expect(component.replyingTo).toBe(null);
      expect(component.editingId).toBe("c1");
    });

    it("surfaces the API error message when saving fails", () => {
      commentService.editComment.mockReturnValue(
        throwError(() => ({
          error: { errors: [{ status: "400", title: "Comment is empty" }] },
        })),
      );
      component.startEdit(makeComment({ canEdit: true }) as any);
      component.editText = "https://link.example.com";
      component.saveEdit();

      expect(component.postError).toBe("Comment is empty");
      expect(component.posting).toBe(false);
    });
  });

  describe("translation", () => {
    it("does not offer translation to an anonymous viewer, even in a foreign language", () => {
      authService.isLoggedIn.mockReturnValue(false);
      translationService.matchesViewerLang.mockReturnValue(false);
      bindBlueprint("bp1");
      expect(
        component.isForeignLanguage(makeComment({ sourceLang: "fr" }) as any),
      ).toBe(false);
    });

    it("does not offer translation for a comment already in the viewer's language", () => {
      translationService.matchesViewerLang.mockReturnValue(true);
      bindBlueprint("bp1");
      expect(
        component.isForeignLanguage(makeComment({ sourceLang: "en" }) as any),
      ).toBe(false);
    });

    it("offers translation for a comment in a different language", () => {
      translationService.matchesViewerLang.mockReturnValue(false);
      bindBlueprint("bp1");
      expect(
        component.isForeignLanguage(makeComment({ sourceLang: "fr" }) as any),
      ).toBe(true);
    });

    it("shows Translate all only with 2+ foreign-language comments visible", () => {
      translationService.matchesViewerLang.mockReturnValue(false);
      commentService.getComments.mockReturnValue(
        of({
          threads: [
            {
              comment: makeComment({ id: "c1", sourceLang: "fr" }),
              replies: [],
            },
          ],
          total: 1,
        }),
      );
      bindBlueprint("bp1");
      expect(component.showTranslateAll).toBe(false);

      commentService.getComments.mockReturnValue(
        of({
          threads: [
            {
              comment: makeComment({ id: "c1", sourceLang: "fr" }),
              replies: [],
            },
            {
              comment: makeComment({ id: "c2", sourceLang: "ru" }),
              replies: [],
            },
          ],
          total: 2,
        }),
      );
      bindBlueprint("bp1");
      expect(component.showTranslateAll).toBe(true);
      expect(component.foreignCommentIds).toEqual(["c1", "c2"]);
    });

    it("translateComment fetches once and toggles the original back into view", () => {
      translationService.matchesViewerLang.mockReturnValue(false);
      translationService.translateComments.mockReturnValue(
        of({
          translations: [
            {
              id: "c1",
              segments: [{ type: "text", text: "translated" }],
              sourceLang: "fr",
              cached: false,
            },
          ],
        }),
      );
      translationService.cachedComment.mockReturnValue(null);
      bindBlueprint("bp1");

      const comment = makeComment({ id: "c1", sourceLang: "fr" }) as any;
      component.translateComment(comment);
      expect(translationService.translateComments).toHaveBeenCalledWith("bp1", [
        "c1",
      ]);
      expect(component.showingTranslationIds.has("c1")).toBe(true);

      component.showOriginalComment(comment);
      expect(component.showingTranslationIds.has("c1")).toBe(false);

      translationService.cachedComment.mockReturnValue({
        segments: [{ type: "text", text: "translated" }],
        sourceLang: "fr",
      });
      component.translateComment(comment);
      expect(translationService.translateComments).toHaveBeenCalledTimes(1);
    });

    it("translateAll issues exactly one batch request for all foreign comments", () => {
      translationService.matchesViewerLang.mockReturnValue(false);
      commentService.getComments.mockReturnValue(
        of({
          threads: [
            {
              comment: makeComment({ id: "c1", sourceLang: "fr" }),
              replies: [],
            },
            {
              comment: makeComment({ id: "c2", sourceLang: "ru" }),
              replies: [],
            },
          ],
          total: 2,
        }),
      );
      bindBlueprint("bp1");

      component.translateAll();
      expect(translationService.translateComments).toHaveBeenCalledTimes(1);
      expect(translationService.translateComments).toHaveBeenCalledWith("bp1", [
        "c1",
        "c2",
      ]);
    });

    it("renders a degraded note instead of the attribution when a translation is degraded", () => {
      translationService.matchesViewerLang.mockReturnValue(false);
      translationService.translateComments.mockReturnValue(
        of({
          translations: [
            {
              id: "c1",
              segments: [{ type: "text", text: "nice build" }],
              sourceLang: "fr",
              cached: false,
              degraded: true,
            },
          ],
        }),
      );
      commentService.getComments.mockReturnValue(
        of({
          threads: [
            {
              comment: makeComment({ id: "c1", sourceLang: "fr" }),
              replies: [],
            },
          ],
          total: 1,
        }),
      );
      bindBlueprint("bp1");

      component.translateComment(
        makeComment({ id: "c1", sourceLang: "fr" }) as any,
      );
      translationService.cachedComment.mockReturnValue({
        segments: [{ type: "text", text: "nice build" }],
        sourceLang: "fr",
        degraded: true,
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        "Translation unavailable",
      );
    });
  });

  describe("delete", () => {
    it("deletes and reloads", () => {
      bindBlueprint("bp1");
      component.delete(makeComment({ canDelete: true }) as any);

      expect(commentService.deleteComment).toHaveBeenCalledWith("c1");
      expect(commentService.getComments).toHaveBeenCalledTimes(2);
    });
  });
});
