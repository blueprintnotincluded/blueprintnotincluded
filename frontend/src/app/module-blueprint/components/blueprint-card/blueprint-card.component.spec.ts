import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";

import { BlueprintCardComponent } from "./blueprint-card.component";

function makeItem(overrides: any = {}) {
  return {
    id: "bp-1",
    name: "Real Blueprint",
    ownerId: "u1",
    ownerName: "alice",
    createdAt: new Date("2026-01-01"),
    modifiedAt: new Date("2026-01-01"),
    thumbnail: "data:image/png;base64,xyz",
    nbLikes: 7,
    likedByMe: true,
    ownedByMe: false,
    commentCount: 4,
    nbForks: 3,
    category: null,
    gameVersion: null,
    modded: false,
    ...overrides,
  };
}

describe("BlueprintCardComponent", () => {
  let component: BlueprintCardComponent;
  let fixture: ComponentFixture<BlueprintCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BlueprintCardComponent],
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
      By.css(".bni-card__thumb, .bni-card__title")
    );
    expect(links.length).toBe(2);
    links.forEach((link) =>
      expect(link.properties["routerLink"]).toEqual(["/blueprint", "bp-1"])
    );
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

  it("links the category, gameVersion, and modded chips to filtered discover pages", () => {
    component.item = makeItem({
      category: "power",
      gameVersion: "spacedOut",
      modded: true,
    });
    fixture.detectChanges();

    const category = fixture.debugElement.query(By.css(".bni-chip--cat"));
    expect(category.properties["routerLink"]).toEqual(["/discover"]);
    expect(category.properties["queryParams"]).toEqual({ category: "power" });
    expect(category.properties["title"]).toContain("power");

    const gameVersion = fixture.debugElement.query(
      By.css("a.bni-chip:not(.bni-chip--cat):not(.bni-chip--modded)")
    );
    expect(gameVersion.properties["routerLink"]).toEqual(["/discover"]);
    expect(gameVersion.properties["queryParams"]).toEqual({
      gameVersion: "spacedOut",
    });

    const modded = fixture.debugElement.query(By.css(".bni-chip--modded"));
    expect(modded.properties["routerLink"]).toEqual(["/discover"]);
    expect(modded.properties["queryParams"]).toEqual({ modded: "true" });
  });

  it("passes like state through to the like widget", () => {
    component.item = makeItem({ nbLikes: 7, likedByMe: true });
    component.loggedIn = false;
    fixture.detectChanges();

    const widget = fixture.debugElement.query(By.css("app-like-widget"));
    expect(widget.properties["blueprintId"]).toBe("bp-1");
    expect(widget.properties["nbLikes"]).toBe(7);
    expect(widget.properties["likedByMe"]).toBe(true);
    expect(widget.properties["disabled"]).toBe(true);
  });

  it("renders the comment and fork counts", () => {
    component.item = makeItem({ commentCount: 4, nbForks: 3 });
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css(".card-comments")).nativeElement
        .textContent
    ).toContain("4");
    expect(
      fixture.debugElement.query(By.css(".card-forks")).nativeElement
        .textContent
    ).toContain("3");
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
    expect(fixture.debugElement.query(By.css("app-like-widget"))).toBeNull();
  });

  it("renders the no-results state without card content", () => {
    component.item = makeItem({ thumbnail: "svg_nothing", name: "No Results" });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("No Results");
    expect(fixture.debugElement.query(By.css("app-like-widget"))).toBeNull();
  });
});
