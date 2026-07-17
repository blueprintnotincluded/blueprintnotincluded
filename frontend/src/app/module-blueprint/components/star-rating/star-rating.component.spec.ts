import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { StarRatingComponent } from "./star-rating.component";

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

  it("renders nothing when unrated", () => {
    component.average = 0;
    component.count = 0;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-stars"))).toBeNull();
  });

  it("fills the rounded average out of five stars", () => {
    component.average = 4.5; // rounds to 5
    component.count = 2;
    fixture.detectChanges();

    const stars = fixture.debugElement.queryAll(By.css(".bni-stars svg"));
    const empty = fixture.debugElement.queryAll(
      By.css(".bni-stars svg.bni-stars__empty"),
    );
    expect(stars.length).toBe(5);
    expect(empty.length).toBe(0);
  });

  it("rounds a middling average down", () => {
    component.average = 3.4; // rounds to 3
    component.count = 5;
    fixture.detectChanges();

    const empty = fixture.debugElement.queryAll(
      By.css(".bni-stars svg.bni-stars__empty"),
    );
    expect(empty.length).toBe(2);
  });

  it("shows the rating count label by default", () => {
    component.average = 4;
    component.count = 2;
    fixture.detectChanges();
    const count = fixture.debugElement.query(By.css(".bni-stars__count"));
    expect(count.nativeElement.textContent).toContain("2 ratings");
  });

  it("hides the count when showCount is false", () => {
    component.average = 4;
    component.count = 2;
    component.showCount = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css(".bni-stars__count"))).toBeNull();
  });

  it("exposes an accessible label with the average and count", () => {
    component.average = 4.5;
    component.count = 1;
    fixture.detectChanges();
    const host = fixture.debugElement.query(By.css(".bni-stars"));
    expect(host.attributes["aria-label"]).toBe("Rated 4.5 out of 5 (1 rating)");
  });
});
