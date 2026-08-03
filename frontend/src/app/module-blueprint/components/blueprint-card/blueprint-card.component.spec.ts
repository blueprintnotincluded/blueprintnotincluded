import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";

import { BlueprintCardComponent } from "./blueprint-card.component";
import { QueuedPreviewDirective } from "../../directives/queued-preview.directive";

function makeItem(overrides: any = {}) {
  return {
    id: "bp-1",
    name: "Real Blueprint",
    ownerId: "u1",
    ownerName: "alice",
    createdAt: new Date("2026-01-01"),
    modifiedAt: new Date("2026-01-01"),
    thumbnail: "real",
    nbRatings: 7,
    rating: 4.5,
    commentCount: 4,
    nbForks: 3,
    nbViews: 25,
    nbDownloads: 6,
    category: null,
    requiredDlcs: [],
    modded: false,
    isPublished: true,
    ...overrides,
  };
}

describe("BlueprintCardComponent", () => {
  let component: BlueprintCardComponent;
  let fixture: ComponentFixture<BlueprintCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BlueprintCardComponent],
      imports: [QueuedPreviewDirective],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BlueprintCardComponent);
    component = fixture.componentInstance;
  });

  it("creates", () => {
    component.item = makeItem();
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it("links the thumbnail and title to the details page, not the editor", () => {
    component.item = makeItem();
    fixture.detectChanges();

    const links = fixture.debugElement.queryAll(
      By.css(".bni-card__thumb, .bni-card__title"),
    );
    expect(links.length).toBe(2);
    links.forEach((link) =>
      expect(link.properties["routerLink"]).toEqual(["/blueprint", "bp-1"]),
    );
  });

  it("uses the versioned server-rendered preview as the image source", () => {
    component.item = makeItem({ modifiedAt: new Date(1700000000000) });
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css(".bni-card__thumb img"));
    expect(img.nativeElement.getAttribute("src")).toBe(
      "/api/blueprints/bp-1/preview/card.webp?v=1700000000000",
    );
  });

  it("falls back to the stored-thumbnail endpoint when the server preview errors", () => {
    component.item = makeItem({ modifiedAt: new Date(1700000000000) });
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css(".bni-card__thumb img"));
    img.triggerEventHandler("error", {});
    fixture.detectChanges();

    expect(img.nativeElement.getAttribute("src")).toBe(
      "/api/blueprints/bp-1/thumbnail?v=1700000000000",
    );
  });

  it("provides no fallback url for sentinel thumbnails", () => {
    component.item = makeItem({ thumbnail: "svg" });
    expect(component.thumbnailFallbackUrl()).toBeNull();
  });

  it("shows the Draft chip only when the blueprint is unpublished", () => {
    component.item = makeItem({ isPublished: false });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-chip--draft"))).not.toBe(
      null,
    );

    component.item = makeItem({ isPublished: true });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-chip--draft"))).toBe(null);
  });

  it("shows the Untagged chip when there is no category, and the category chip when there is", () => {
    component.item = makeItem({ category: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Untagged");

    component.item = makeItem({ category: "power" });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("Untagged");
    expect(fixture.nativeElement.textContent).toContain("power");
  });

  it("shows a modded chip only when the blueprint is modded", () => {
    component.item = makeItem({ modded: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Modded");
  });

  it("links the category, DLC, and modded chips to filtered discover pages", () => {
    component.item = makeItem({
      category: "power",
      requiredDlcs: ["EXPANSION1_ID"],
      modded: true,
    });
    fixture.detectChanges();

    const category = fixture.debugElement.query(By.css(".bni-chip--cat"));
    expect(category.properties["routerLink"]).toEqual(["/discover"]);
    expect(category.properties["queryParams"]).toEqual({ category: "power" });
    expect(category.properties["title"]).toContain("power");

    const dlc = fixture.debugElement.query(By.css("a.bni-chip--dlc"));
    expect(dlc.properties["routerLink"]).toEqual(["/discover"]);
    expect(dlc.properties["queryParams"]).toEqual({ dlc: "EXPANSION1_ID" });

    const modded = fixture.debugElement.query(By.css(".bni-chip--modded"));
    expect(modded.properties["routerLink"]).toEqual(["/discover"]);
    expect(modded.properties["queryParams"]).toEqual({ modded: "true" });
  });

  // Labels come from lib's DLC_LABELS, never from the raw id — a chip reading
  // "DLC3_ID" would be a regression, not a cosmetic detail.
  it("renders one chip per required DLC, labelled not raw", () => {
    component.item = makeItem({ requiredDlcs: ["DLC2_ID", "DLC3_ID"] });
    fixture.detectChanges();

    const chips = fixture.debugElement.queryAll(By.css("a.bni-chip--dlc"));
    expect(chips.length).toBe(2);
    expect(chips.map((chip) => chip.nativeElement.textContent.trim())).toEqual([
      "The Frosty Planet Pack",
      "The Bionic Booster Pack",
    ]);
    expect(fixture.nativeElement.textContent).not.toContain("DLC2_ID");
  });

  it("renders an empty requirement set as a base game chip", () => {
    component.item = makeItem({ requiredDlcs: [] });
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css("a.bni-chip--dlc")).length,
    ).toBe(0);
    expect(fixture.nativeElement.textContent).toContain("Base game");
  });

  // Absent is not the same fact as empty: a blueprint saved before DLC
  // derivation existed must not claim to be buildable without any DLC.
  it("says nothing when requirements were never derived", () => {
    component.item = makeItem({ requiredDlcs: undefined });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("Base game");
  });

  it("renders a linked chip per detected room, using display labels", () => {
    component.item = makeItem({ rooms: ["latrine", "messHall"] });
    fixture.detectChanges();

    const chips = fixture.debugElement.queryAll(By.css("a.bni-chip--room"));
    expect(chips.length).toBe(2);
    expect(chips[0].nativeElement.textContent.trim()).toBe("Latrine");
    expect(chips[0].properties["routerLink"]).toEqual(["/discover"]);
    expect(chips[0].properties["queryParams"]).toEqual({ rooms: "latrine" });
    expect(chips[1].nativeElement.textContent.trim()).toBe("Mess Hall");
  });

  it("collapses room chips beyond three into a +N marker naming the rest", () => {
    component.item = makeItem({
      rooms: ["latrine", "barracks", "messHall", "kitchen", "stable"],
    });
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css("a.bni-chip--room")).length,
    ).toBe(3);
    const more = fixture.debugElement.query(By.css(".bni-chip--room-more"));
    expect(more.nativeElement.textContent.trim()).toBe("+2");
    expect(more.properties["title"]).toBe("Kitchen, Stable");
  });

  it("renders no room chips when rooms is missing or empty", () => {
    component.item = makeItem({ rooms: null });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-chip--room"))).toBeNull();

    component.item = makeItem({ rooms: [] });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-chip--room"))).toBeNull();
  });

  it("passes the rating aggregate through to the star row", () => {
    component.item = makeItem({ nbRatings: 7, rating: 4.5 });
    fixture.detectChanges();

    const stars = fixture.debugElement.query(By.css("app-star-rating"));
    expect(stars.properties["average"]).toBe(4.5);
    expect(stars.properties["count"]).toBe(7);
    expect(stars.properties["showCount"]).toBe(false);
  });

  it("renders the comment and fork counts", () => {
    component.item = makeItem({ commentCount: 4, nbForks: 3 });
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css(".card-comments")).nativeElement
        .textContent,
    ).toContain("4");
    expect(
      fixture.debugElement.query(By.css(".card-forks")).nativeElement
        .textContent,
    ).toContain("3");
  });

  it("renders the view and download counts", () => {
    component.item = makeItem({ nbViews: 25, nbDownloads: 6 });
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css(".card-views")).nativeElement
        .textContent,
    ).toContain("25");
    expect(
      fixture.debugElement.query(By.css(".card-downloads")).nativeElement
        .textContent,
    ).toContain("6");
  });

  it("hides the owner byline when showOwner is false", () => {
    component.item = makeItem();
    component.showOwner = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".card-owner"))).toBeTruthy();

    component.showOwner = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".card-owner"))).toBeNull();
  });

  it("attaches linkState to the details routerLinks for a history-aware back-link", () => {
    component.item = makeItem();
    component.linkState = { fromProfile: "alice" };
    fixture.detectChanges();

    const title = fixture.debugElement.query(By.css(".bni-card__title"));
    expect(title.properties["state"]).toEqual({ fromProfile: "alice" });
  });

  it("renders a skeleton for loading placeholder items", () => {
    component.item = makeItem({ thumbnail: "svg" });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css(".bni-skel"))).toBeTruthy();
    expect(fixture.debugElement.query(By.css("app-star-rating"))).toBeNull();
  });

  it("renders the no-results state without card content", () => {
    component.item = makeItem({ thumbnail: "svg_nothing", name: "No Results" });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("No Results");
    expect(fixture.debugElement.query(By.css("app-star-rating"))).toBeNull();
  });

  it("shows a copies chip only when duplicates were collapsed behind it", () => {
    component.item = makeItem({ duplicateCount: 0 });
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css(".bni-chip--duplicates")),
    ).toBeNull();

    component.item = makeItem({ duplicateCount: 85 });
    fixture.detectChanges();
    const chip = fixture.debugElement.query(By.css(".bni-chip--duplicates"));
    expect(chip).not.toBeNull();
    expect(chip.nativeElement.textContent).toContain("85");
  });
});
