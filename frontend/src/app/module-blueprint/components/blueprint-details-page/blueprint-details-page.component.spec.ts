import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";
import { Location } from "@angular/common";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { of, throwError } from "rxjs";

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
    nbForks: 0,
    forkedFrom: null,
    ...overrides,
  };
}

describe("BlueprintDetailsPageComponent", () => {
  let component: BlueprintDetailsPageComponent;
  let fixture: ComponentFixture<BlueprintDetailsPageComponent>;
  let blueprintService: any;
  let authService: any;

  beforeEach(async () => {
    blueprintService = {
      getBlueprintDetails: vi.fn().mockReturnValue(of(makeDetails())),
    };
    authService = { isLoggedIn: vi.fn().mockReturnValue(true) };

    await TestBed.configureTestingModule({
      declarations: [BlueprintDetailsPageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BlueprintService, useValue: blueprintService },
        { provide: AuthenticationService, useValue: authService },
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
});
