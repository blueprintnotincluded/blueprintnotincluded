import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";
import { Location } from "@angular/common";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { of, throwError, Subject } from "rxjs";

import { MessageService } from "primeng/api";

import { BlueprintDetailsPageComponent } from "./blueprint-details-page.component";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";

function makeDetails(overrides: any = {}) {
  return {
    id: "bp1",
    name: "Super Coal Generator Setup",
    ownerId: "owner-1",
    ownerName: "alice",
    createdAt: new Date("2026-07-01").toISOString(),
    modifiedAt: new Date("2026-07-01").toISOString(),
    thumbnail: "data:image/png;base64,xyz",
    nbLikes: 2,
    likedByMe: false,
    ownedByMe: false,
    commentCount: 3,
    gameVersion: "spacedOut",
    category: "power",
    subcategory: null,
    description: "A tidy coal setup",
    researchTier: null,
    modded: false,
    isPublished: true,
    nbForks: 0,
    nbViews: 0,
    nbDownloads: 0,
    forkedFrom: null,
    ...overrides,
  };
}

describe("BlueprintDetailsPageComponent", () => {
  let component: BlueprintDetailsPageComponent;
  let fixture: ComponentFixture<BlueprintDetailsPageComponent>;
  let blueprintService: any;
  let authService: any;
  let messageService: any;

  beforeEach(async () => {
    blueprintService = {
      getBlueprintDetails: vi.fn().mockReturnValue(of(makeDetails())),
      getRelatedBlueprints: vi.fn().mockReturnValue(of({ blueprints: [] })),
      setPublished: vi.fn().mockReturnValue(of({ isPublished: true })),
    };
    authService = { isLoggedIn: vi.fn().mockReturnValue(true) };
    messageService = { add: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [BlueprintDetailsPageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BlueprintService, useValue: blueprintService },
        { provide: AuthenticationService, useValue: authService },
        { provide: MessageService, useValue: messageService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: "bp1" })),
            fragment: of(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BlueprintDetailsPageComponent);
    component = fixture.componentInstance;
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  it("loads details for the routed blueprint id", () => {
    fixture.detectChanges();

    expect(blueprintService.getBlueprintDetails).toHaveBeenCalledWith("bp1");
    expect(component.details?.name).toBe("Super Coal Generator Setup");
    expect(component.blueprintId).toBe("bp1");
    expect(component.loading).toBe(false);
    expect(component.notFound).toBe(false);
  });

  it("shows not-found when the blueprint does not exist", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      throwError(() => ({ status: 404 }))
    );
    fixture.detectChanges();

    expect(component.notFound).toBe(true);
    expect(component.details).toBe(null);
    expect(component.loading).toBe(false);
  });

  it("detects placeholder thumbnails", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      of(makeDetails({ thumbnail: "svg" }))
    );
    fixture.detectChanges();

    expect(component.hasRealThumbnail()).toBe(false);
  });

  it("uses the server-rendered hero preview, falling back to the inline thumbnail on error", () => {
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css(".details-thumbnail img"));
    expect(img.properties["src"]).toBe(
      `/api/blueprints/bp1/preview/hero.webp?v=${new Date(
        "2026-07-01"
      ).getTime()}`
    );

    img.triggerEventHandler("error", {});
    fixture.detectChanges();
    expect(img.properties["src"]).toBe("data:image/png;base64,xyz");
  });

  it("clears a previous preview failure when switching to a different blueprint", () => {
    const route = TestBed.inject(ActivatedRoute) as any;
    const paramMap$ = new Subject<ReturnType<typeof convertToParamMap>>();
    route.paramMap = paramMap$;

    fixture = TestBed.createComponent(BlueprintDetailsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    paramMap$.next(convertToParamMap({ id: "bp1" }));
    fixture.detectChanges();

    let img = fixture.debugElement.query(By.css(".details-thumbnail img"));
    img.triggerEventHandler("error", {});
    fixture.detectChanges();
    expect(component.previewFailed).toBe(true);

    blueprintService.getBlueprintDetails.mockReturnValue(
      of(makeDetails({ id: "bp2", name: "Other Setup" }))
    );
    paramMap$.next(convertToParamMap({ id: "bp2" }));
    fixture.detectChanges();

    expect(component.previewFailed).toBe(false);
    img = fixture.debugElement.query(By.css(".details-thumbnail img"));
    expect(img.properties["src"]).toBe(
      `/api/blueprints/bp2/preview/hero.webp?v=${new Date(
        "2026-07-01"
      ).getTime()}`
    );
  });

  describe("related blueprints", () => {
    const relatedItem = {
      id: "bp2",
      name: "Related Setup",
      ownerId: "owner-2",
      ownerName: "bob",
      createdAt: new Date("2026-06-01").toISOString(),
      modifiedAt: new Date("2026-06-01").toISOString(),
      thumbnail: "data:image/png;base64,xyz",
      nbLikes: 0,
      likedByMe: false,
      ownedByMe: false,
      commentCount: 0,
      isPublished: true,
      nbForks: 0,
      nbViews: 0,
      nbDownloads: 0,
    };

    it("fetches and renders related blueprints once details load", () => {
      blueprintService.getRelatedBlueprints.mockReturnValue(
        of({ blueprints: [relatedItem] })
      );
      fixture.detectChanges();

      expect(blueprintService.getRelatedBlueprints).toHaveBeenCalledWith("bp1");
      expect(component.relatedBlueprints).toEqual([relatedItem]);
      const cards = fixture.debugElement.queryAll(
        By.css(".details-related app-blueprint-card")
      );
      expect(cards.length).toBe(1);
    });

    it("hides the section when there are no related blueprints", () => {
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css(".details-related"))).toBeNull();
    });

    it("does not blow up the page when the related fetch fails", () => {
      blueprintService.getRelatedBlueprints.mockReturnValue(
        throwError(() => new Error("boom"))
      );

      expect(() => fixture.detectChanges()).not.toThrow();
      expect(component.relatedBlueprints).toEqual([]);
      expect(component.details?.name).toBe("Super Coal Generator Setup");
    });
  });

  it("renders the details and passes the blueprint id to the comment section", () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector("h1")?.textContent).toContain(
      "Super Coal Generator Setup"
    );
    expect(el.querySelector("app-comment-section")).toBeTruthy();
    expect(el.textContent).toContain("A tidy coal setup");
  });

  it("renders the forked-from link when forkedFrom is set", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      of(
        makeDetails({
          forkedFrom: {
            blueprintId: "parent-1",
            blueprintName: "Original Setup",
          },
        })
      )
    );
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain("Forked from");
    expect(el.textContent).toContain("Original Setup");
  });

  it("renders the removed-parent placeholder when the fork's parent is soft-deleted", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      of(
        makeDetails({
          forkedFrom: { blueprintId: "parent-1", blueprintName: null },
        })
      )
    );
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain("[original removed by author]");
  });

  it("links the category, subcategory, gameVersion, and modded chips to filtered discover pages", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      of(makeDetails({ subcategory: "generator", modded: true }))
    );
    fixture.detectChanges();

    const category = fixture.debugElement.query(By.css(".bni-chip--cat"));
    expect(category.properties["routerLink"]).toEqual(["/discover"]);
    expect(category.properties["queryParams"]).toEqual({ category: "power" });

    const subcategory = fixture.debugElement.queryAll(
      By.css(".bni-chip--cat")
    )[1];
    expect(subcategory.properties["routerLink"]).toEqual(["/discover"]);
    expect(subcategory.properties["queryParams"]).toEqual({
      category: "power",
      subcategory: "generator",
    });

    const gameVersion = fixture.debugElement.query(
      By.css("a.bni-chip:not(.bni-chip--cat):not(.bni-chip--modded)")
    );
    expect(gameVersion.properties["queryParams"]).toEqual({
      gameVersion: "spacedOut",
    });

    const modded = fixture.debugElement.query(By.css(".bni-chip--modded"));
    expect(modded.properties["queryParams"]).toEqual({ modded: "true" });
  });

  it("links the fork count to a discover page filtered by forkedFrom", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      of(makeDetails({ nbForks: 5 }))
    );
    fixture.detectChanges();

    const forkCount = fixture.debugElement.query(By.css(".details-fork-count"));
    expect(forkCount.properties["routerLink"]).toEqual(["/discover"]);
    expect(forkCount.properties["queryParams"]).toEqual({ forkedFrom: "bp1" });
    expect(forkCount.nativeElement.textContent).toContain("5");
  });

  it("shows the view and download counts with pluralized labels", () => {
    blueprintService.getBlueprintDetails.mockReturnValue(
      of(makeDetails({ nbViews: 41, nbDownloads: 1 }))
    );
    fixture.detectChanges();

    const views = fixture.debugElement.query(By.css(".details-views"));
    expect(views.nativeElement.textContent).toContain("41");
    expect(views.nativeElement.textContent).toContain("views");

    const downloads = fixture.debugElement.query(By.css(".details-downloads"));
    expect(downloads.nativeElement.textContent).toContain("1");
    expect(downloads.nativeElement.textContent).toContain("download");
    expect(downloads.nativeElement.textContent).not.toContain("downloads");
  });

  describe("scrollToFragment", () => {
    it("scrolls to the fragment element once and clears the pending fragment", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.fragment = of("comments");

      // re-create so ngOnInit subscribes to the updated fragment observable
      fixture = TestBed.createComponent(BlueprintDetailsPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      const target = document.createElement("div");
      target.id = "comments";
      // jsdom does not implement scrollIntoView
      const scrollSpy = vi.fn();
      (target as any).scrollIntoView = scrollSpy;
      document.body.appendChild(target);

      component.scrollToFragment();
      expect(scrollSpy).toHaveBeenCalled();

      scrollSpy.mockClear();
      component.scrollToFragment();
      expect(scrollSpy).not.toHaveBeenCalled();

      document.body.removeChild(target);
    });

    it("does nothing when there is no fragment", () => {
      fixture.detectChanges();
      expect(() => component.scrollToFragment()).not.toThrow();
    });
  });

  it("opens the version history dialog with ownership passed through", () => {
    fixture.detectChanges();
    component.versionHistoryDialog = { showDialog: vi.fn() } as any;

    component.openVersionHistory();

    expect(component.versionHistoryDialog.showDialog).toHaveBeenCalledWith(
      "bp1",
      false
    );
  });

  it("passes the blueprint id and name to the share dialog", () => {
    fixture.detectChanges();
    const shareDialog = fixture.debugElement.query(
      By.css("app-dialog-share-url")
    );
    expect(shareDialog.properties["blueprintId"]).toBe("bp1");
    expect(shareDialog.properties["blueprintName"]).toBe(
      "Super Coal Generator Setup"
    );
  });

  describe("back-link", () => {
    it("defaults to Discover when there is no navigation state", () => {
      fixture.detectChanges();
      expect(component.backLink).toEqual(["/discover"]);
      expect(component.backLabel).toContain("Discover");
    });

    it("routes back to the profile when navigation arrived from one", () => {
      const location = TestBed.inject(Location);
      vi.spyOn(location, "getState").mockReturnValue({
        fromProfile: "alice",
      });

      fixture.detectChanges();

      expect(component.backLink).toEqual(["/profile", "alice"]);
      expect(component.backLabel).toContain("Profile");
    });

    it("still routes back to the profile when the blueprint 404s", () => {
      const location = TestBed.inject(Location);
      vi.spyOn(location, "getState").mockReturnValue({
        fromProfile: "alice",
      });
      blueprintService.getBlueprintDetails.mockReturnValue(
        throwError(() => ({ status: 404 }))
      );

      fixture.detectChanges();

      expect(component.notFound).toBe(true);
      expect(component.backLink).toEqual(["/profile", "alice"]);
      expect(component.backLabel).toContain("Profile");
    });
  });

  describe("publish / unpublish", () => {
    it("shows the Draft chip and Publish button on an owned draft", () => {
      blueprintService.getBlueprintDetails.mockReturnValue(
        of(makeDetails({ ownedByMe: true, isPublished: false }))
      );
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css(".bni-chip--draft"))).not.toBe(
        null
      );
      expect(fixture.debugElement.query(By.css(".details-publish"))).not.toBe(
        null
      );
      expect(fixture.debugElement.query(By.css(".details-unpublish"))).toBe(
        null
      );
    });

    it("shows neither chip nor publish controls on someone else's draft-free blueprint", () => {
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css(".bni-chip--draft"))).toBe(null);
      expect(fixture.debugElement.query(By.css(".details-publish"))).toBe(null);
      expect(fixture.debugElement.query(By.css(".details-unpublish"))).toBe(
        null
      );
    });

    it("shows Unpublish (but no chip) on an owned published blueprint", () => {
      blueprintService.getBlueprintDetails.mockReturnValue(
        of(makeDetails({ ownedByMe: true, isPublished: true }))
      );
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css(".bni-chip--draft"))).toBe(null);
      expect(fixture.debugElement.query(By.css(".details-publish"))).toBe(null);
      expect(fixture.debugElement.query(By.css(".details-unpublish"))).not.toBe(
        null
      );
    });

    it("publishes: calls the service, flips state, and toasts success", () => {
      blueprintService.getBlueprintDetails.mockReturnValue(
        of(makeDetails({ ownedByMe: true, isPublished: false }))
      );
      fixture.detectChanges();

      component.togglePublish(true);

      expect(blueprintService.setPublished).toHaveBeenCalledWith("bp1", true);
      expect(component.details?.isPublished).toBe(true);
      expect(component.publishWorking).toBe(false);
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "success" })
      );
    });

    it("unpublishes and toasts", () => {
      blueprintService.getBlueprintDetails.mockReturnValue(
        of(makeDetails({ ownedByMe: true, isPublished: true }))
      );
      blueprintService.setPublished.mockReturnValue(of({ isPublished: false }));
      fixture.detectChanges();

      component.togglePublish(false);

      expect(blueprintService.setPublished).toHaveBeenCalledWith("bp1", false);
      expect(component.details?.isPublished).toBe(false);
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "success",
          summary: expect.stringContaining("moved back to drafts"),
        })
      );
    });

    it("keeps state and toasts an error when the call fails", () => {
      blueprintService.getBlueprintDetails.mockReturnValue(
        of(makeDetails({ ownedByMe: true, isPublished: false }))
      );
      blueprintService.setPublished.mockReturnValue(
        throwError(() => new Error("boom"))
      );
      fixture.detectChanges();

      component.togglePublish(true);

      expect(component.details?.isPublished).toBe(false);
      expect(component.publishWorking).toBe(false);
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "error" })
      );
    });

    it("disables Share on a draft with a publish hint", () => {
      blueprintService.getBlueprintDetails.mockReturnValue(
        of(makeDetails({ ownedByMe: true, isPublished: false }))
      );
      fixture.detectChanges();

      const shareButton = fixture.debugElement.query(By.css(".details-share"));
      expect(shareButton.nativeElement.disabled).toBe(true);
      expect(component.shareTitle).toContain("Publish");
    });
  });
});
