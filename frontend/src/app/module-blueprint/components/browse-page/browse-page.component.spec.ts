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
        }),
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
          useValue: {
            queryParamMap: of(EMPTY_PARAMS),
            snapshot: { queryParamMap: EMPTY_PARAMS },
          },
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
        throwError(() => new Error("network")),
      );
      component.appendLoading();
      component.getBlueprints();

      expect(component.working).toBe(false);
      expect(component.loadError).toBe(true);
      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem),
      ).toBe(false);
    });

    it("re-enables infinite scroll after a failure (working=false)", () => {
      blueprintService.getBlueprints.mockReturnValue(
        throwError(() => new Error("network")),
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

  describe("empty page handling (infinite scroll end)", () => {
    it("stops scrolling on an empty page even when remaining is missing", () => {
      // Old server responses omitted `remaining` for empty pages; undefined
      // never matched the ===0 check and infinite scroll looped forever.
      component.handleGetBlueprints({
        oldest: Date.now(),
        blueprints: [],
      } as any);
      expect(component.noMoreBlueprints).toBe(true);
    });

    it("does not reset the pagination cursor on an empty page", () => {
      const cursor = new Date("2024-01-01");
      component.oldestDate = cursor;
      component.handleGetBlueprints({
        oldest: Date.now(),
        blueprints: [],
        remaining: 0,
      } as any);
      expect(component.oldestDate).toBe(cursor);
    });
  });

  describe("showMyBlueprints", () => {
    it("filters the feed by the requesting user's id", () => {
      const data: BrowseData = {
        filterUserId: "user-123",
        filterUserName: "alice",
      };
      component.showMyBlueprints(data);

      expect(component.filterUserId).toBe("user-123");
      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        "user-123",
        null,
        null,
        null,
        null,
        "recent",
        undefined,
        null,
        null,
        null,
        null,
      );
    });
  });

  describe("facet filters", () => {
    it("passes gameVersion filter to getBlueprints", () => {
      component.filterGameVersion = "spacedOut";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        null,
        "spacedOut",
        null,
        null,
        "recent",
        undefined,
        null,
        null,
        null,
        null,
      );
    });

    it("passes category filter to getBlueprints", () => {
      component.filterCategory = "power";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        null,
        null,
        "power",
        null,
        "recent",
        undefined,
        null,
        null,
        null,
        null,
      );
    });

    it("passes subcategory filter to getBlueprints", () => {
      component.filterCategory = "power";
      component.filterSubcategory = "generator";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        null,
        null,
        "power",
        "generator",
        "recent",
        undefined,
        null,
        null,
        null,
        null,
      );
    });

    it("passes modded filter to getBlueprints", () => {
      component.filterModded = true;
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        null,
        null,
        null,
        null,
        "recent",
        undefined,
        true,
        null,
        null,
        null,
      );
    });

    it("passes forkedFrom filter to getBlueprints", () => {
      component.filterForkedFrom = "parent-1";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        null,
        null,
        null,
        null,
        "recent",
        undefined,
        null,
        "parent-1",
        null,
        null,
      );
    });

    it("passes rooms filter to getBlueprints", () => {
      component.filterRooms = "latrine";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        expect.any(Date),
        null,
        null,
        null,
        null,
        null,
        "recent",
        undefined,
        null,
        null,
        null,
        "latrine",
      );
    });

    it("onRoomsChange resets the list, updates the URL, and refetches", () => {
      component.blueprintListItems = [{ name: "stale" } as any];
      component.filterRooms = "kitchen";
      component.onRoomsChange();

      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale"),
      ).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { rooms: "kitchen" },
        replaceUrl: true,
      });
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[11]).toBe("kitchen");
    });

    it("offers every room type plus an All rooms option", () => {
      expect(component.roomOptions[0].value).toBeNull();
      expect(component.roomOptions.length).toBe(19); // 18 room types + All
      expect(component.roomOptions.some((o) => o.value === "latrine")).toBe(
        true,
      );
    });

    it("initializes rooms from the URL query param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ rooms: "latrine" }));
      component.ngOnInit();
      expect(component.filterRooms).toBe("latrine");
    });

    it("clearFilters resets all facets (including modded, forkedFrom, rooms) and refetches", () => {
      component.filterGameVersion = "base";
      component.filterCategory = "cooling";
      component.filterSubcategory = "fan";
      component.filterName = "test";
      component.filterModded = true;
      component.filterForkedFrom = "parent-1";
      component.filterRooms = "latrine";
      component.clearFilters();

      expect(component.filterGameVersion).toBeNull();
      expect(component.filterCategory).toBeNull();
      expect(component.filterSubcategory).toBeNull();
      expect(component.filterModded).toBeNull();
      expect(component.filterForkedFrom).toBeNull();
      expect(component.filterRooms).toBeNull();
      expect(component.filterName).toBe("");
      expect(blueprintService.getBlueprints).toHaveBeenCalled();
    });

    it("initializes modded from the URL query param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ modded: "true" }));
      component.ngOnInit();
      expect(component.filterModded).toBe(true);
    });

    it("initializes forkedFrom from the URL query param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ forkedFrom: "parent-1" }));
      component.ngOnInit();
      expect(component.filterForkedFrom).toBe("parent-1");
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
      expect(lastCall[6]).toBe("popular");
      expect(lastCall[7]).toBe(0); // skip reset before refetch
      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale"),
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
      expect(lastCall[6]).toBe("recent");
      expect(lastCall[7]).toBeUndefined();
    });

    it("advances skip by the number of blueprints received", () => {
      component.sort = "popular";
      component.skipCount = 0;
      component.handleGetBlueprints(
        makeResponse([{ name: "a" }, { name: "b" }], 5) as any,
      );
      expect(component.skipCount).toBe(2);
    });

    it("initializes sort from the URL query param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ sort: "popular" }));
      component.ngOnInit();
      expect(component.sort).toBe("popular");
    });

    it("calls the service with sort=mostForked and skip=0, and updates the URL", () => {
      component.skipCount = 7;
      component.sort = "mostForked";
      component.onSortChange();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[6]).toBe("mostForked");
      expect(lastCall[7]).toBe(0);
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { sort: "mostForked" },
        replaceUrl: true,
      });
    });

    it("initializes sort=mostForked from the URL query param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ sort: "mostForked" }));
      component.ngOnInit();
      expect(component.sort).toBe("mostForked");
    });

    it("accepts the count sorts and falls back to recent on junk", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ sort: "mostViewed" }));
      component.ngOnInit();
      expect(component.sort).toBe("mostViewed");

      route.queryParamMap = of(convertToParamMap({ sort: "mostDownloaded" }));
      component.ngOnInit();
      expect(component.sort).toBe("mostDownloaded");

      route.queryParamMap = of(convertToParamMap({ sort: "bogus" }));
      component.ngOnInit();
      expect(component.sort).toBe("recent");
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
        component.blueprintListItems.some((i: any) => i.name === "stale"),
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
        callsBefore,
      );
    });
  });

  describe("sidebar facet clicks", () => {
    it("selectCategory sets the facet and resets subcategory", () => {
      component.filterCategory = "power";
      component.filterSubcategory = "generator";

      component.selectCategory("cooling");

      expect(component.filterCategory).toBe("cooling");
      expect(component.filterSubcategory).toBeNull();
    });

    it("selectCategory is a no-op when the value is already active", () => {
      component.filterCategory = "power";
      component.filterSubcategory = "generator";
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;

      component.selectCategory("power");

      // an active-facet re-click must not wipe subcategory or refetch
      expect(component.filterSubcategory).toBe("generator");
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore,
      );
    });

    it("selectGameVersion keeps the subcategory (it is scoped to category)", () => {
      component.filterCategory = "power";
      component.filterSubcategory = "generator";

      component.selectGameVersion("spacedOut");

      expect(component.filterGameVersion).toBe("spacedOut");
      expect(component.filterSubcategory).toBe("generator");
    });

    it("selectRoom updates the URL and refetches", () => {
      component.selectRoom("kitchen");

      expect(component.filterRooms).toBe("kitchen");
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { rooms: "kitchen" },
        replaceUrl: true,
      });
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[11]).toBe("kitchen");
    });

    it("selectSort funnels into onSortChange", () => {
      component.selectSort("popular");

      expect(component.sort).toBe("popular");
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[6]).toBe("popular");
    });

    it("selectSort is a no-op when the sort is already active", () => {
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.selectSort("recent");
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore,
      );
    });

    it("counts active filters for the mobile disclosure label", () => {
      expect(component.activeFilterCount).toBe(0);
      expect(component.hasActiveFilters).toBe(false);

      component.filterName = "spom";
      component.filterCategory = "power";
      component.filterModded = false;

      expect(component.activeFilterCount).toBe(3);
      expect(component.hasActiveFilters).toBe(true);
    });
  });

  describe("blueprint card rendering", () => {
    const realItem = {
      id: "bp-1",
      name: "Real Blueprint",
      ownerId: "u1",
      ownerName: "alice",
      createdAt: new Date(),
      modifiedAt: new Date(),
      thumbnail: "real",
      nbRatings: 7,
      rating: 4.5,
      myRating: null,
      ownedByMe: false,
      nbForks: 3,
    } as any;

    function renderWithItem() {
      fixture.detectChanges(); // ngOnInit
      component.blueprintListItems = [realItem];
      fixture.detectChanges();
      return fixture.debugElement.query(By.css("app-blueprint-card"));
    }

    // Card rendering itself (like widget, fork count, chips, ...) is covered by
    // BlueprintCardComponent's own spec; here we only verify the page wires the
    // right data through to the shared card.
    it("passes the list item and login state to the shared card", () => {
      const card = renderWithItem();
      expect(card).toBeTruthy();
      expect(card.properties["item"]).toBe(realItem);
      expect(card.properties["loggedIn"]).toBe(true);
    });

    it("marks cards logged-out when the user is not authenticated", () => {
      authService.isLoggedIn.mockReturnValue(false);
      const card = renderWithItem();
      expect(card.properties["loggedIn"]).toBe(false);
    });

    it("renders a card for placeholder items too", () => {
      fixture.detectChanges();
      component.blueprintListItems = [component.loadingBlueprintItem];
      fixture.detectChanges();
      const cards = fixture.debugElement.queryAll(By.css("app-blueprint-card"));
      expect(cards.length).toBe(1);
      expect(cards[0].properties["item"]).toBe(component.loadingBlueprintItem);
    });
  });
});
