import { Component, EventEmitter, Input, Output } from "@angular/core";
import { BlueprintRateResponse } from "../../../../../../lib/index";
import { BlueprintService } from "../../services/blueprint-service";

/**
 * Interactive 1–5 star control: click a star to set/replace your rating.
 * Emits the server's fresh aggregate so the parent can update its display.
 */
@Component({
  selector: "app-rating-widget",
  templateUrl: "./rating-widget.component.html",
  styleUrls: ["./rating-widget.component.css"],
  standalone: false,
})
export class RatingWidgetComponent {
  @Input() blueprintId!: string;
  @Input() myRating: number | null = null;
  /** true when logged out or viewing your own blueprint */
  @Input() disabled = false;
  @Input() ownBlueprint = false;
  @Output() rated = new EventEmitter<BlueprintRateResponse>();

  readonly starValues = [1, 2, 3, 4, 5];
  hoverValue: number | null = null;
  working = false;

  constructor(private blueprintService: BlueprintService) {}

  get displayValue(): number {
    return this.hoverValue ?? this.myRating ?? 0;
  }

  get title(): string {
    if (this.ownBlueprint) return $localize`You can't rate your own blueprint`;
    if (this.disabled) return $localize`Log in to rate`;
    return this.myRating != null
      ? $localize`Your rating: ${this.myRating} — click to change`
      : $localize`Rate this blueprint`;
  }

  rate(value: number) {
    if (this.disabled || this.ownBlueprint || this.working) return;
    if (value === this.myRating) return;
    const previous = this.myRating;
    this.myRating = value; // optimistic; server response confirms
    this.working = true;
    this.blueprintService.rateBlueprint(this.blueprintId, value).subscribe({
      next: (response) => {
        this.working = false;
        this.myRating = response.myRating;
        this.rated.emit(response);
      },
      error: () => {
        this.working = false;
        this.myRating = previous;
      },
    });
  }
}
