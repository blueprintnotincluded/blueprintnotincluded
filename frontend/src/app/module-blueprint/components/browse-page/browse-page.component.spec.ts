import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { of, Subject, throwError } from "rxjs";
import { convertToParamMap } from "@angular/router";

import { By } from "@angular/platform-browser";

import { BrowsePageComponent } from "./browse-page.component";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { UserService } from "src/app/module-blueprint/services/user-service";

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
      getDlcPreferences: vi.fn().mockReturnValue(of({ excludedDlcs: [] })),
      updateDlcPreferences: vi.fn().mockReturnValue(of({ excludedDlcs: [] })),
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

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run the full list transition (grid fade-out + placeholder dwell) under
   * fake timers so specs can assert the settled state. */
  function settleListTransition() {
    vi.advanceTimersByTime(600);
  }

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

  describe("facet filters", () => {
    it("passes category filter to getBlueprints", () => {
      component.filterCategory = "power";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        null,
        null,
        null,
        "power",
        null,
        "trending",
        0,
        null,
        null,
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
        null,
        null,
        null,
        "power",
        "generator",
        "trending",
        0,
        null,
        null,
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
        null,
        null,
        null,
        null,
        null,
        "trending",
        0,
        true,
        null,
        null,
        null,
        null,
        null,
      );
    });

    it("passes forkedFrom filter to getBlueprints", () => {
      component.filterForkedFrom = "parent-1";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        null,
        null,
        null,
        null,
        null,
        "trending",
        0,
        null,
        "parent-1",
        null,
        null,
        null,
        null,
      );
    });

    it("passes rooms filter to getBlueprints", () => {
      component.filterRooms = "latrine";
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        null,
        null,
        null,
        null,
        null,
        "trending",
        0,
        null,
        null,
        null,
        "latrine",
        null,
        null,
      );
    });

    it("passes the selected DLCs to getBlueprints as a comma list", () => {
      component.filterDlcs = ["DLC2_ID", "DLC3_ID"];
      component.getBlueprints();

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        null,
        null,
        null,
        null,
        null,
        "trending",
        0,
        null,
        null,
        null,
        null,
        "DLC2_ID,DLC3_ID",
        null,
      );
    });

    it("onRoomsChange resets the list, updates the URL, and refetches", () => {
      vi.useFakeTimers();
      component.blueprintListItems = [{ name: "stale" } as any];
      component.filterRooms = "kitchen";
      component.onRoomsChange();
      settleListTransition();

      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale"),
      ).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { rooms: "kitchen" },
        replaceUrl: true,
      });
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[10]).toBe("kitchen");
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
      component.filterCategory = "cooling";
      component.filterSubcategory = "fan";
      component.filterName = "test";
      component.filterModded = true;
      component.filterForkedFrom = "parent-1";
      component.filterRooms = "latrine";
      component.filterDlcs = ["DLC2_ID"];
      component.clearFilters();

      expect(component.filterDlcs).toEqual([]);
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

  describe("DLC filter", () => {
    it("offers every known pack, labelled from lib rather than by raw id", () => {
      const values = component.dlcOptions.map((o) => o.value);
      expect(values).toContain("EXPANSION1_ID");
      expect(values).toContain("DLC3_ID");
      expect(
        component.dlcOptions.find((o) => o.value === "DLC3_ID")!.label,
      ).toBe("The Bionic Booster Pack");
      // sorted by label, not by Klei's id numbering
      expect(component.dlcOptions.map((o) => o.label)).toEqual(
        [...component.dlcOptions.map((o) => o.label)].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
    });

    it("initializes the selection from a comma-separated URL param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ dlc: "DLC2_ID,DLC3_ID" }));
      component.ngOnInit();
      expect(component.filterDlcs).toEqual(["DLC2_ID", "DLC3_ID"]);
    });

    it("initializes the selection from a repeated URL param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(
        convertToParamMap({ dlc: ["DLC2_ID", "DLC3_ID"] }),
      );
      component.ngOnInit();
      expect(component.filterDlcs).toEqual(["DLC2_ID", "DLC3_ID"]);
    });

    it("writes the selection back to the URL as a comma list", () => {
      vi.useFakeTimers();
      component.toggleDlc("DLC2_ID");
      component.toggleDlc("DLC3_ID");
      vi.advanceTimersByTime(600);

      expect(router.navigate).toHaveBeenLastCalledWith([], {
        queryParams: { dlc: "DLC2_ID,DLC3_ID" },
        replaceUrl: true,
      });
    });

    it("round-trips through the URL: what it writes, it reads back", () => {
      vi.useFakeTimers();
      component.toggleDlc("DLC2_ID");
      component.toggleDlc("DLC3_ID");
      vi.advanceTimersByTime(600);
      const written = router.navigate.mock.calls.at(-1)[1].queryParams;
      vi.useRealTimers();

      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap(written));
      const reopened = TestBed.createComponent(BrowsePageComponent);
      reopened.componentInstance.ngOnInit();

      expect(reopened.componentInstance.filterDlcs).toEqual([
        "DLC2_ID",
        "DLC3_ID",
      ]);
    });

    it("omits the param entirely when nothing is selected", () => {
      vi.useFakeTimers();
      component.toggleDlc("DLC2_ID");
      component.toggleDlc("DLC2_ID"); // toggled back off
      vi.advanceTimersByTime(600);

      expect(component.filterDlcs).toEqual([]);
      expect(
        router.navigate.mock.calls.at(-1)[1].queryParams,
      ).not.toHaveProperty("dlc");
    });

    // Packs are independent: picking a second one widens the result set
    // ("needs any of these") rather than replacing the first.
    it("toggles selections independently instead of replacing them", () => {
      component.toggleDlc("DLC2_ID");
      component.toggleDlc("DLC3_ID");
      expect(component.filterDlcs).toEqual(["DLC2_ID", "DLC3_ID"]);
      expect(component.isDlcSelected("DLC2_ID")).toBe(true);

      component.toggleDlc("DLC2_ID");
      expect(component.filterDlcs).toEqual(["DLC3_ID"]);
      expect(component.isDlcSelected("DLC2_ID")).toBe(false);
    });

    it("counts each selected pack as an active filter", () => {
      component.filterDlcs = ["DLC2_ID", "DLC3_ID"];
      expect(component.activeFilterCount).toBe(2);
      expect(component.hasActiveFilters).toBe(true);
    });

    it("shows one chip per pack, labelled, each removable on its own", () => {
      component.filterDlcs = ["DLC2_ID", "DLC3_ID"];

      const chips = component.activeFilterChips.filter((c) =>
        c.key.startsWith("dlc-"),
      );
      expect(chips.map((c) => c.label)).toEqual([
        "The Frosty Planet Pack",
        "The Bionic Booster Pack",
      ]);

      chips[0].remove();
      expect(component.filterDlcs).toEqual(["DLC3_ID"]);
    });

    it("clearDlcFilter is a no-op when nothing is selected", () => {
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.clearDlcFilter();
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore,
      );
    });
  });

  describe("DLC exclusion filter", () => {
    it("initializes the exclusion from a comma-separated URL param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(
        convertToParamMap({ excludeDlc: "DLC3_ID,DLC4_ID" }),
      );
      component.ngOnInit();
      expect(component.excludeDlcs).toEqual(["DLC3_ID", "DLC4_ID"]);
    });

    it("initializes the exclusion from a repeated URL param", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(
        convertToParamMap({ excludeDlc: ["DLC3_ID", "DLC4_ID"] }),
      );
      component.ngOnInit();
      expect(component.excludeDlcs).toEqual(["DLC3_ID", "DLC4_ID"]);
    });

    it("writes the exclusion back to the URL as a comma list under excludeDlc", () => {
      vi.useFakeTimers();
      component.toggleExcludeDlc("DLC3_ID");
      component.toggleExcludeDlc("DLC4_ID");
      vi.advanceTimersByTime(600);

      expect(router.navigate).toHaveBeenLastCalledWith([], {
        queryParams: { excludeDlc: "DLC3_ID,DLC4_ID" },
        replaceUrl: true,
      });
    });

    it("round-trips through the URL: what it writes, it reads back", () => {
      vi.useFakeTimers();
      component.toggleExcludeDlc("DLC3_ID");
      component.toggleExcludeDlc("DLC4_ID");
      vi.advanceTimersByTime(600);
      const written = router.navigate.mock.calls.at(-1)[1].queryParams;
      vi.useRealTimers();

      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap(written));
      const reopened = TestBed.createComponent(BrowsePageComponent);
      reopened.componentInstance.ngOnInit();

      expect(reopened.componentInstance.excludeDlcs).toEqual([
        "DLC3_ID",
        "DLC4_ID",
      ]);
    });

    it("omits the param entirely when nothing is excluded", () => {
      vi.useFakeTimers();
      component.toggleExcludeDlc("DLC3_ID");
      component.toggleExcludeDlc("DLC3_ID"); // toggled back off
      vi.advanceTimersByTime(600);

      expect(component.excludeDlcs).toEqual([]);
      expect(
        router.navigate.mock.calls.at(-1)[1].queryParams,
      ).not.toHaveProperty("excludeDlc");
    });

    it("toggles exclusions independently instead of replacing them", () => {
      component.toggleExcludeDlc("DLC3_ID");
      component.toggleExcludeDlc("DLC4_ID");
      expect(component.excludeDlcs).toEqual(["DLC3_ID", "DLC4_ID"]);
      expect(component.isDlcExcluded("DLC3_ID")).toBe(true);

      component.toggleExcludeDlc("DLC3_ID");
      expect(component.excludeDlcs).toEqual(["DLC4_ID"]);
      expect(component.isDlcExcluded("DLC3_ID")).toBe(false);
    });

    it("counts each excluded pack as an active filter", () => {
      component.excludeDlcs = ["DLC3_ID", "DLC4_ID"];
      expect(component.activeFilterCount).toBe(2);
      expect(component.hasActiveFilters).toBe(true);
    });

    it("shows one removable chip per excluded pack, marked as an exclusion", () => {
      component.excludeDlcs = ["DLC3_ID"];

      const chips = component.activeFilterChips.filter((c) =>
        c.key.startsWith("exclude-dlc-"),
      );
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toContain("The Bionic Booster Pack");
      expect(chips[0].exclude).toBe(true);

      chips[0].remove();
      expect(component.excludeDlcs).toEqual([]);
    });

    it("a show-only chip is not marked as an exclusion", () => {
      component.filterDlcs = ["DLC3_ID"];
      const chip = component.activeFilterChips.find(
        (c) => c.key === "dlc-DLC3_ID",
      );
      expect(chip!.exclude).toBeFalsy();
    });

    it("clearExcludeDlcFilter is a no-op when nothing is excluded", () => {
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.clearExcludeDlcFilter();
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore,
      );
      expect(userService.updateDlcPreferences).not.toHaveBeenCalled();
    });

    it("clearFilters also clears any active exclusion", () => {
      component.excludeDlcs = ["DLC3_ID"];
      component.clearFilters();
      expect(component.excludeDlcs).toEqual([]);
    });

    // A pack can't be both "show only" and "hide" — whichever is chosen
    // second wins and clears the other side.
    it("selecting a pack as show-only clears it from the exclusion list", () => {
      component.toggleExcludeDlc("DLC3_ID");
      userService.updateDlcPreferences.mockClear();

      component.toggleDlc("DLC3_ID");

      expect(component.excludeDlcs).toEqual([]);
      expect(component.filterDlcs).toEqual(["DLC3_ID"]);
      expect(userService.updateDlcPreferences).toHaveBeenCalledWith([]);
    });

    it("excluding a pack clears it from the show-only list", () => {
      component.toggleDlc("DLC3_ID");

      component.toggleExcludeDlc("DLC3_ID");

      expect(component.filterDlcs).toEqual([]);
      expect(component.excludeDlcs).toEqual(["DLC3_ID"]);
    });

    it("passes the excluded DLCs to getBlueprints as a comma list", () => {
      component.excludeDlcs = ["DLC3_ID", "DLC4_ID"];
      component.getBlueprints();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[12]).toBe("DLC3_ID,DLC4_ID");
    });
  });

  describe("DLC exclusion persistence", () => {
    it("persists the exclusion list on every toggle", () => {
      component.toggleExcludeDlc("DLC3_ID");
      expect(userService.updateDlcPreferences).toHaveBeenLastCalledWith([
        "DLC3_ID",
      ]);

      component.toggleExcludeDlc("DLC4_ID");
      expect(userService.updateDlcPreferences).toHaveBeenLastCalledWith([
        "DLC3_ID",
        "DLC4_ID",
      ]);
    });

    it("persists an empty list when clearing an active exclusion", () => {
      component.excludeDlcs = ["DLC3_ID"];
      component.clearExcludeDlcFilter();
      expect(userService.updateDlcPreferences).toHaveBeenCalledWith([]);
    });

    it("does not persist for a logged-out visitor", () => {
      authService.isLoggedIn.mockReturnValue(false);
      component.toggleExcludeDlc("DLC3_ID");
      expect(userService.updateDlcPreferences).not.toHaveBeenCalled();
    });

    it("does not fetch or apply a stored preference for a logged-out visitor", () => {
      authService.isLoggedIn.mockReturnValue(false);
      fixture.detectChanges();
      expect(userService.getDlcPreferences).not.toHaveBeenCalled();
      expect(component.excludeDlcs).toEqual([]);
    });

    it("nothing is excluded on first load when the stored preference is empty", () => {
      fixture.detectChanges();
      expect(userService.getDlcPreferences).toHaveBeenCalled();
      expect(component.excludeDlcs).toEqual([]);
      // The very first request must not have waited on the preference either.
      const firstCall = blueprintService.getBlueprints.mock.calls[0];
      expect(firstCall[12]).toBeNull();
    });

    it("applies a stored exclusion preference on load when the URL has no override", () => {
      userService.getDlcPreferences.mockReturnValue(
        of({ excludedDlcs: ["DLC3_ID"] }),
      );
      fixture.detectChanges();
      expect(component.excludeDlcs).toEqual(["DLC3_ID"]);
    });

    it("merely loading the stored preference does not write it back", () => {
      userService.getDlcPreferences.mockReturnValue(
        of({ excludedDlcs: ["DLC3_ID"] }),
      );
      fixture.detectChanges();
      expect(component.excludeDlcs).toEqual(["DLC3_ID"]);
      expect(userService.updateDlcPreferences).not.toHaveBeenCalled();
    });

    it("an explicit excludeDlc URL param wins over the stored preference", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ excludeDlc: "DLC4_ID" }));
      userService.getDlcPreferences.mockReturnValue(
        of({ excludedDlcs: ["DLC3_ID"] }),
      );
      fixture.detectChanges();

      expect(userService.getDlcPreferences).not.toHaveBeenCalled();
      expect(component.excludeDlcs).toEqual(["DLC4_ID"]);
    });
  });

  describe("sort", () => {
    it("calls the service with sort=popular and skip=0, resets the list, and updates the URL", () => {
      vi.useFakeTimers();
      component.blueprintListItems = [{ name: "stale" } as any];
      component.skipCount = 42;

      component.sort = "popular";
      component.onSortChange();
      settleListTransition();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[5]).toBe("popular");
      expect(lastCall[6]).toBe(0); // skip reset before refetch
      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale"),
      ).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { sort: "popular" },
        replaceUrl: true,
      });
    });

    it("does not pass skip for the cursor-paginated recent sort", () => {
      component.sort = "recent";
      component.getBlueprints();

      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[5]).toBe("recent");
      expect(lastCall[6]).toBeUndefined();
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
      expect(lastCall[5]).toBe("mostForked");
      expect(lastCall[6]).toBe(0);
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

    it("accepts the count sorts and falls back to the trending default on junk", () => {
      const route = TestBed.inject(ActivatedRoute) as any;
      route.queryParamMap = of(convertToParamMap({ sort: "mostViewed" }));
      component.ngOnInit();
      expect(component.sort).toBe("mostViewed");

      route.queryParamMap = of(convertToParamMap({ sort: "mostDownloaded" }));
      component.ngOnInit();
      expect(component.sort).toBe("mostDownloaded");

      route.queryParamMap = of(convertToParamMap({ sort: "bogus" }));
      component.ngOnInit();
      expect(component.sort).toBe("trending");
    });

    it("defaults to trending and keeps it out of the URL", () => {
      expect(component.sort).toBe("trending");

      component.sort = "trending";
      component.getBlueprints();
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[5]).toBe("trending");

      // Switching back to the default must clear the sort query param.
      (component as any).applyFiltersToUrl();
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: {},
        replaceUrl: true,
      });
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
      vi.useFakeTimers();
      component.blueprintListItems = [{ name: "stale" } as any];
      component.setViewMode("feed");
      settleListTransition();

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

    it("selectRoom updates the URL and refetches", () => {
      component.selectRoom("kitchen");

      expect(component.filterRooms).toBe("kitchen");
      expect(router.navigate).toHaveBeenCalledWith([], {
        queryParams: { rooms: "kitchen" },
        replaceUrl: true,
      });
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[10]).toBe("kitchen");
    });

    it("selectSort funnels into onSortChange", () => {
      component.selectSort("popular");

      expect(component.sort).toBe("popular");
      const lastCall = blueprintService.getBlueprints.mock.calls.at(-1);
      expect(lastCall[5]).toBe("popular");
    });

    it("selectSort is a no-op when the sort is already active", () => {
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.selectSort("trending"); // the default/current sort
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

  describe("active filter chips (visible above the grid regardless of sidebar scroll)", () => {
    it("is empty with no active filters", () => {
      expect(component.activeFilterChips).toEqual([]);
    });

    it("builds one chip per active facet, using human labels for rooms and modded", () => {
      component.filterName = "spom";
      component.filterCategory = "ranching";
      component.filterSubcategory = "critter";
      component.filterModded = true;
      component.filterRooms = "latrine,kitchen";

      const labels = component.activeFilterChips.map((c) => c.label);

      expect(labels).toEqual([
        'Search: "spom"',
        "ranching",
        "critter",
        "Modded",
        "Latrine",
        "Kitchen",
      ]);
    });

    it("labels an explicit modded=false as Base game", () => {
      component.filterModded = false;
      expect(component.activeFilterChips[0].label).toBe("Base game");
    });

    it("clicking a chip's remove() clears just that facet and refetches", () => {
      component.filterCategory = "ranching";
      component.filterRooms = "latrine";

      const categoryChip = component.activeFilterChips.find(
        (c) => c.key === "category",
      )!;
      categoryChip.remove();

      expect(component.filterCategory).toBeNull();
      expect(component.filterRooms).toBe("latrine");
    });

    it("removing a room chip clears the whole rooms filter (rooms is single-select)", () => {
      component.filterRooms = "latrine,kitchen";

      const roomChip = component.activeFilterChips.find((c) =>
        c.key.startsWith("room-"),
      )!;
      roomChip.remove();

      expect(component.filterRooms).toBeNull();
    });

    it("clearNameFilter is a no-op when the search box is already empty", () => {
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.clearNameFilter();
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore,
      );
    });

    it("clearModdedFilter is a no-op when modded is already unset", () => {
      const callsBefore = blueprintService.getBlueprints.mock.calls.length;
      component.clearModdedFilter();
      expect(blueprintService.getBlueprints.mock.calls.length).toBe(
        callsBefore,
      );
    });

    it("clearModdedFilter resets modded (facetSubject refetches on the next tick)", () => {
      component.filterModded = true;
      component.clearModdedFilter();
      expect(component.filterModded).toBeNull();
    });
  });

  describe("empty-state messaging", () => {
    it("uses the generic no-results message when no filters are active", () => {
      component.handleGetBlueprints({
        oldest: Date.now(),
        blueprints: [],
        remaining: 0,
      } as any);

      expect(component.blueprintListItems[0].name).toBe("No Results");
    });

    it("uses a filter-aware message when the empty page is filter-driven", () => {
      component.filterCategory = "ranching";
      component.filterRooms = "latrine";

      component.handleGetBlueprints({
        oldest: Date.now(),
        blueprints: [],
        remaining: 0,
      } as any);

      expect(component.blueprintListItems[0].name).toBe(
        "No blueprints match these filters",
      );
    });
  });

  describe("list transition (minimum animation on context switches)", () => {
    it("keeps the old cards during the fade-out, then applies a fast response with no placeholder flash", () => {
      vi.useFakeTimers();
      blueprintService.getBlueprints.mockReturnValue(
        of(makeResponse([{ name: "fresh" }], 0)),
      );
      component.blueprintListItems = [{ name: "stale" } as any];

      component.selectSort("popular");

      // during the fade the old cards must still be on screen
      expect(component.listSwitching).toBe(true);
      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale"),
      ).toBe(true);

      vi.advanceTimersByTime(200); // past the 160ms fade

      // response beat the fade: real cards applied directly, no placeholders
      expect(component.listSwitching).toBe(false);
      expect(
        component.blueprintListItems.some((i: any) => i.name === "fresh"),
      ).toBe(true);
      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem),
      ).toBe(false);
    });

    it("shows placeholders for a slow response and keeps them a minimum dwell", () => {
      vi.useFakeTimers();
      const slow = new Subject<any>();
      blueprintService.getBlueprints.mockReturnValue(slow);
      component.blueprintListItems = [{ name: "stale" } as any];

      component.selectSort("popular");
      vi.advanceTimersByTime(200); // fade done, response still pending

      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem),
      ).toBe(true);

      slow.next(makeResponse([{ name: "fresh" }], 0));

      // response arrived 40ms into the placeholder dwell — must not flash
      vi.advanceTimersByTime(40);
      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem),
      ).toBe(true);

      vi.advanceTimersByTime(300); // dwell elapsed
      expect(
        component.blueprintListItems.some((i: any) => i.name === "fresh"),
      ).toBe(true);
      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem),
      ).toBe(false);
    });

    it("holds an error until the fade-out completes", () => {
      vi.useFakeTimers();
      blueprintService.getBlueprints.mockReturnValue(
        throwError(() => new Error("network")),
      );
      component.blueprintListItems = [{ name: "stale" } as any];

      component.selectSort("popular");
      expect(component.loadError).toBe(false); // not yet — grid still fading

      vi.advanceTimersByTime(200);
      expect(component.loadError).toBe(true);
      expect(
        component.blueprintListItems.includes(component.loadingBlueprintItem),
      ).toBe(false);
    });

    it("a second switch during the fade supersedes the first (stale response dropped)", () => {
      vi.useFakeTimers();
      const first = new Subject<any>();
      blueprintService.getBlueprints.mockReturnValue(first);
      component.selectSort("popular");

      vi.advanceTimersByTime(50);
      blueprintService.getBlueprints.mockReturnValue(
        of(makeResponse([{ name: "second" }], 0)),
      );
      component.selectSort("trending");
      first.next(makeResponse([{ name: "first" }], 0)); // stale — must be dropped

      settleListTransition();
      expect(
        component.blueprintListItems.some((i: any) => i.name === "second"),
      ).toBe(true);
      expect(
        component.blueprintListItems.some((i: any) => i.name === "first"),
      ).toBe(false);
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
