import { Component, Input } from "@angular/core";

/** Display-only Workshop-style star row for a blueprint's rating aggregate. */
@Component({
  selector: "app-star-rating",
  templateUrl: "./star-rating.component.html",
  standalone: false,
})
export class StarRatingComponent {
  /** Average rating 1–5; 0 = unrated (component renders nothing) */
  @Input() average = 0;
  /** Number of ratings behind the average */
  @Input() count = 0;
  @Input() showCount = true;

  readonly starIndexes = [0, 1, 2, 3, 4];

  get filled(): number {
    if (this.count <= 0 || this.average <= 0) return 0;
    return Math.max(1, Math.min(5, Math.round(this.average)));
  }

  get ratingsLabel(): string {
    return $localize`${this.count} rating${this.count != 1 ? "s" : ""}`;
  }

  get ariaLabel(): string {
    return $localize`Rated ${this.average} out of 5 (${this.ratingsLabel})`;
  }
}
