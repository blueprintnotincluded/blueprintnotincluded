import { Component, Input } from "@angular/core";

/**
 * Maps a like count onto 1–5 filled stars (0 likes → 0, component hides).
 * Log scale: 1→1★, 2–3→2★, 4–7→3★, 8–15→4★, 16+→5★ — tuned to the
 * site's like volumes, retune here when the community grows.
 */
export function starsFromLikes(nbLikes: number): number {
  if (nbLikes <= 0) return 0;
  return Math.min(5, 1 + Math.floor(Math.log2(nbLikes)));
}

/** Display-only Workshop-style star row derived from likes. */
@Component({
  selector: "app-star-rating",
  templateUrl: "./star-rating.component.html",
  standalone: false,
})
export class StarRatingComponent {
  @Input() nbLikes = 0;
  @Input() showCount = true;

  readonly starIndexes = [0, 1, 2, 3, 4];

  get filled(): number {
    return starsFromLikes(this.nbLikes);
  }

  get likesLabel(): string {
    return $localize`${this.nbLikes} like${this.nbLikes != 1 ? "s" : ""}`;
  }
}
