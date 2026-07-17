import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { of, throwError } from "rxjs";

import { RatingWidgetComponent } from "./rating-widget.component";
import { BlueprintService } from "../../services/blueprint-service";

describe("RatingWidgetComponent", () => {
  let fixture: ComponentFixture<RatingWidgetComponent>;
  let component: RatingWidgetComponent;
  let blueprintService: any;

  beforeEach(async () => {
    blueprintService = {
      rateBlueprint: vi
        .fn()
        .mockReturnValue(of({ nbRatings: 3, rating: 4, myRating: 5 })),
    };

    await TestBed.configureTestingModule({
      declarations: [RatingWidgetComponent],
      providers: [{ provide: BlueprintService, useValue: blueprintService }],
    }).compileComponents();

    fixture = TestBed.createComponent(RatingWidgetComponent);
    component = fixture.componentInstance;
    component.blueprintId = "bp-1";
  });

  it("renders five star buttons", () => {
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(By.css(".bni-rate__star")).length,
    ).toBe(5);
  });

  it("rates on click and emits the fresh aggregate", () => {
    const emitted: any[] = [];
    component.rated.subscribe((r) => emitted.push(r));
    fixture.detectChanges();

    const stars = fixture.debugElement.queryAll(By.css(".bni-rate__star"));
    stars[4].nativeElement.click();

    expect(blueprintService.rateBlueprint).toHaveBeenCalledWith("bp-1", 5);
    expect(component.myRating).toBe(5);
    expect(emitted).toEqual([{ nbRatings: 3, rating: 4, myRating: 5 }]);
  });

  it("does not rate when disabled", () => {
    component.disabled = true;
    fixture.detectChanges();

    fixture.debugElement
      .queryAll(By.css(".bni-rate__star"))[2]
      .nativeElement.click();

    expect(blueprintService.rateBlueprint).not.toHaveBeenCalled();
  });

  it("does not rate your own blueprint", () => {
    component.ownBlueprint = true;
    fixture.detectChanges();

    component.rate(4);

    expect(blueprintService.rateBlueprint).not.toHaveBeenCalled();
  });

  it("is a no-op when clicking the current rating", () => {
    component.myRating = 4;
    fixture.detectChanges();

    component.rate(4);

    expect(blueprintService.rateBlueprint).not.toHaveBeenCalled();
  });

  it("rolls back the optimistic rating on error", () => {
    blueprintService.rateBlueprint.mockReturnValue(
      throwError(() => new Error("network")),
    );
    component.myRating = 2;
    fixture.detectChanges();

    component.rate(5);

    expect(component.myRating).toBe(2);
  });

  it("fills stars up to the hovered value for preview", () => {
    component.myRating = 2;
    component.hoverValue = 4;
    fixture.detectChanges();

    const filled = fixture.debugElement.queryAll(
      By.css(".bni-rate__star--filled"),
    );
    expect(filled.length).toBe(4);
  });
});
