import { Component, OnInit, Input } from "@angular/core";
import { BlueprintService } from "../../services/blueprint-service";

@Component({
  selector: "app-like-widget",
  templateUrl: "./like-widget.component.html",
  styleUrls: ["./like-widget.component.css"],
  
})
export class LikeWidgetComponent implements OnInit {
  @Input() blueprintId: string;
  @Input() nbLikes: number = 0;
  @Input() likedByMe: boolean;
  @Input() disabled: boolean;

  get nbLikesString() {
    return $localize`like${this.nbLikes != 1 ? "s" : ""}`;
  }

  constructor(private blueprintService: BlueprintService) {}

  ngOnInit() {
    1; // required for type
  }

  like() {
    this.likedByMe = !this.likedByMe;
    this.nbLikes += this.likedByMe ? 1 : -1;

    this.blueprintService.likeBlueprint(this.blueprintId, this.likedByMe);
  }
}
