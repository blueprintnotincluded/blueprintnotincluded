import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { convertToParamMap } from "@angular/router";

import { By } from "@angular/platform-browser";

import { BrowsePageComponent } from "./browse-page.component";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { UserService } from "src/app/module-blueprint/services/user-service";
import { BrowseData } from "../user-menu/user-menu.component";

function makeResponse(blueprints: any[] = [], remaining = 0) {
  return {
    oldest: new Date("2024-01-01").getTime(),
    remaining,
    blueprints,
  };
}

const EMPTY_PARAMS = convertToParamMap({});

describe("BrowsePageComponent", () => {
  let component: BrowsePageComponent;
  let fixture: ComponentFixture<BrowsePageComponent>;
  let blueprintService: any;
  let authService: any;
  let userService: any;
  let router: any;

  beforeEach(async () => {
    blueprintService = {
      getBlueprints: vi.fn().mockReturnValue(of(makeResponse())),
    };

    authService = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      getUserDetails: vi.fn().mockReturnValue({ username: "alice" }),
    };

    userService = {
      getProfile: vi.fn().mockReturnValue(
        of({
          id: "u1",
          username: "alice",
          bio: "",
          memberSince: new Date().toISOString(),
          blueprintCount: 0,
          followerCount: 0,
          followingCount: 0,
          followedByMe: false,
        })
      ),
      getFeed: vi.fn().mockReturnValue(of(makeResponse())),
    };

    router = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [BrowsePageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BlueprintService, useValue: blueprintService },
        { provide: AuthenticationService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: EMPTY_PARAMS } },
        },
        DatePipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BrowsePageComponent);
    component = fixture.componentInstance;
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  describe("getBlueprints error handling", () => {
    it("clears working, sets loadError, and strips loading placeholders on failure", () => {
      blueprintService.getBlueprints.mockReturnValue(
        throwError(() => new Error("network"))
      );
      component.appendLoading();
      component.getBlueprints();

      expect(component.working).toBe(false);
      expect(component.loadError).toBe(true);
      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem)
      ).toBe(false);
    });

    it("re-enables infinite scroll after a failure (working=false)", () => {
      blueprintService.getBlueprints.mockReturnValue(
        throwError(() => new Error("network"))
      );
      component.getBlueprints();
      // working must be false so onWindowScroll can retry via loadMore
      expect(component.working).toBe(false);
    });

    it("clears loadError on a subsequent successful load", () => {
      component.loadError = true;
      blueprintService.getBlueprints.mockReturnValue(of(makeResponse()));
      component.getBlueprints();
      expect(component.loadError).toBe(false);
    });
  });

  describe("showMyBlueprints", () => {
    it("filters the feed by the requesting user's id", () => {
      const data: BrowseData = {
        filterUserId: "user-123",
        filterUserName: "alice",
        getDuplicates: true,
      };
      component.showMyBlueprints(data);

      expect(component.filterUserId).toBe("user-123");
      // second positional arg is filterUserId
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[1]).toBe("user-123");
    });
  });

  describe("facet filters", () => {
    it("passes gameVersion filter to getBlueprints", () => {
      component.filterGameVersion = "spacedOut";
      component.getBlueprints();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[4]).toBe("spacedOut");
    });

    it("passes category filter to getBlueprints", () => {
      component.filterCategory = "power";
      component.getBlueprints();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[5]).toBe("power");
    });

    it("passes subcategory filter to getBlueprints", () => {
      component.filterCategory = "power";
      component.filterSubcategory = "generator";
      component.getBlueprints();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[6]).toBe("generator");
    });

    it("clearFilters resets all facets and refetches", () => {
      component.filterGameVersion = "base";
      component.filterCategory = "cooling";
      component.filterSubcategory = "fan";
      component.filterName = "test";
      component.clearFilters();

      expect(component.filterGameVersion).toBeNull();
      expect(component.filterCategory).toBeNull();
      expect(component.filterSubcategory).toBeNull();
      expect(component.filterName).toBe("");
      expect(blueprintService.getBlueprints).toHaveBeenCalled();
    });

    it("onFacetChange resets subcategory before refetching", () => {
      component.filterCategory = "power";
      component.filterSubcategory = "generator";

      // Simulate category change
      component.filterCategory = "cooling";
      component.onFacetChange();

      // The facetSubject fires asynchronously via debounceTime(0);
      // test that the field is cleared on the next tick
      expect(component.filterSubcategory).toBeNull();
    });
  });

  describe("sort", () => {
    it("calls the service with sort=popular and skip=0, resets the list, and updates the URL", () => {
      component.blueprintListItems = [{ name: "stale" } as any];
      component.skipCount = 42;

      component.sort = "popular";
      component.onSortChange();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[7]).toBe("popular");
      expect(lastCall[8]).toBe(0); // skip reset before refetch
      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale")
      ).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { sort: "popular" },
        replaceUrl: true,
      });
    });

    it("does not pass skip for the default recent sort", () => {
      component.sort = "recent";
      component.getBlueprints();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[7]).toBe("recent");
      expect(lastCall[8]).toBeUndefined();
    });

    it("advances skip by the number of blueprints received", () => {
      component.sort = "popular";
      component.skipCount = 0;
      component.handleGetBlueprints(
        makeResponse([{ name: "a" }, { name: "b" }], 5) as any
      );
      expect(component.skipCount).toBe(2);
    });

    it("initializes sort from the URL query param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.snapshot = {
        queryParamMap: convertToParamMap({ sort: "popular" }),
      };
      component.ngOnInit();
      expect(component.sort).toBe("popular");
    });
  });

  describe("feed view mode", () => {
    it("fetches following count on init when logged in", () => {
      fixture.detectChanges();
      expect(userService.getProfile).toHaveBeenCalledWith("alice");
      expect(component.followingCount).toBe(0);
    });

    it("does not fetch following count when logged out", () => {
      authService.isLoggedIn.mockReturnValue(false);
      fixture.detectChanges();
      expect(userService.getProfile).not.toHaveBeenCalled();
    });

    it("setViewMode('feed') resets the list and calls the feed endpoint", () => {
      component.blueprintListItems = [{ name: "stale" } as any];
      component.setViewMode("feed");

      expect(component.viewMode).toBe("feed");
      expect(userService.getFeed).toHaveBeenCalled();
      expect(blueprintService.getBlueprints).not.toHaveBeenCalled();
      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale")
      ).toBe(false);
    });

    it("switching back to discover calls getBlueprints again", () => {
      component.setViewMode("feed");
      component.setViewMode("discover");

      expect(component.viewMode).toBe("discover");
      expect(blueprintService.getBlueprints).toHaveBeenCalled();
    });

    it("is a no-op when already in the requested mode", () => {
      component.setViewMode("discover");
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.setViewMode("discover");
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore
      );
    });
  });

  describe("like widget", () => {
    const realItem = {
      id: "bp-1",
      name: "Real Blueprint",
      ownerId: "u1",
      ownerName: "alice",
      createdAt: new Date(),
      modifiedAt: new Date(),
      thumbnail: "data:image/png;base64,xyz",
      tags: [],
      nbLikes: 7,
      likedByMe: true,
      ownedByMe: false,
    } as any;

    function renderWithItem() {
      fixture.detectChanges(); // ngOnInit
      component.blueprintListItems = [realItem];
      fixture.detectChanges();
      return fixture.debugElement.query(By.css("app-like-widget"));
    }

    it("renders on cards with values from the list item", () => {
      const widget = renderWithItem();
      expect(widget).toBeTruthy();
      expect(widget.properties["blueprintId"]).toBe("bp-1");
      expect(widget.properties["nbLikes"]).toBe(7);
      expect(widget.properties["likedByMe"]).toBe(true);
      expect(widget.properties["disabled"]).toBe(false);
    });

    it("is disabled when logged out", () => {
      authService.isLoggedIn.mockReturnValue(false);
      const widget = renderWithItem();
      expect(widget.properties["disabled"]).toBe(true);
    });

    it("is not rendered for placeholder items", () => {
      fixture.detectChanges();
      component.blueprintListItems = [component.loadingBlueprintItem];
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css("app-like-widget"))).toBeNull();
    });
  });
});
