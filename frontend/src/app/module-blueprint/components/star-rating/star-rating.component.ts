import { Component, Input } from "@angular/core";

/**
 * PLACEHOLDER — likes are a stand-in until real per-user star ratings
 * exist. The plan (agent/TODO.md "Star ratings v2") is a server-side
 * aggregate stored on the blueprint and computed out of band; when that
 * lands this component reads the aggregate and this mapping disappears.
 *
 * Until then: maps a like count onto 1–5 filled stars (0 likes → 0,
 * component hides). Log scale: 1→1★, 2–3→2★, 4–7→3★, 8–15→4★, 16+→5★.
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
