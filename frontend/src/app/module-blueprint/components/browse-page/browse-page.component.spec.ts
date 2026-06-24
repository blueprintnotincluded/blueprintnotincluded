import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { of, throwError } from "rxjs";
import { convertToParamMap } from "@angular/router";

import { BrowsePageComponent } from "./browse-page.component";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
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
  let router: any;

  beforeEach(async () => {
    blueprintService = {
      getBlueprints: vi.fn().mockReturnValue(of(makeResponse())),
    };

    router = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [BrowsePageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: BlueprintService, useValue: blueprintService },
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
});
