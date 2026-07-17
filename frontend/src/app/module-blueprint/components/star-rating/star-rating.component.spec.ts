import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { StarRatingComponent, starsFromLikes } from "./star-rating.component";

describe("starsFromLikes", () => {
  it("maps like counts onto the log scale", () => {
    expect(starsFromLikes(0)).toBe(0);
    expect(starsFromLikes(1)).toBe(1);
    expect(starsFromLikes(2)).toBe(2);
    expect(starsFromLikes(3)).toBe(2);
    expect(starsFromLikes(4)).toBe(3);
    expect(starsFromLikes(7)).toBe(3);
    expect(starsFromLikes(8)).toBe(4);
    expect(starsFromLikes(15)).toBe(4);
    expect(starsFromLikes(16)).toBe(5);
    expect(starsFromLikes(9000)).toBe(5);
  });

  it("treats negative counts as zero", () => {
    expect(starsFromLikes(-3)).toBe(0);
  });
});

describe("StarRatingComponent", () => {
  let fixture: ComponentFixture<StarRatingComponent>;
  let component: StarRatingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StarRatingComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StarRatingComponent);
    component = fixture.componentInstance;
  });

  it("renders nothing for zero likes", () => {
    component.nbLikes = 0;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-stars"))).toBeNull();
  });

  it("renders five stars with the filled count derived from likes", () => {
    component.nbLikes = 8; // 4 filled
    fixture.detectChanges();

    const stars = fixture.debugElement.queryAll(By.css(".bni-stars svg"));
    const empty = fixture.debugElement.queryAll(
      By.css(".bni-stars svg.bni-stars__empty"),
    );
    expect(stars.length).toBe(5);
    expect(empty.length).toBe(1);
  });

  it("shows the like count label by default", () => {
    component.nbLikes = 2;
    fixture.detectChanges();
    const count = fixture.debugElement.query(By.css(".bni-stars__count"));
    expect(count.nativeElement.textContent).toContain("2 likes");
  });

  it("hides the count when showCount is false", () => {
    component.nbLikes = 2;
    component.showCount = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-stars__count"))).toBeNull();
  });

  it("exposes the likes as an accessible label", () => {
    component.nbLikes = 1;
    fixture.detectChanges();
    const host = fixture.debugElement.query(By.css(".bni-stars"));
    expect(host.attributes["aria-label"]).toBe("1 like");
  });
});
