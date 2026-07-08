import { Component, ElementRef, ViewChild } from "@angular/core";
import {
  FollowListEntry,
  FollowListResponse,
} from "../../../../../../../lib/index";
import { UserService } from "src/app/module-blueprint/services/user-service";

const FOLLOWERS_TITLE = $localize`:followList.followersTitle:Followers`;
const FOLLOWING_TITLE = $localize`:followList.followingTitle:Following`;

@Component({
  selector: "app-dialog-follow-list",
  templateUrl: "./dialog-follow-list.component.html",
  styleUrls: ["./dialog-follow-list.component.css"],
  standalone: false,
})
export class DialogFollowListComponent {
  @ViewChild("scrollable", { static: true }) scrollable!: ElementRef;

  visible = false;
  title = "";
  entries: FollowListEntry[] = [];
  working = false;
  noMore = false;
  loadError = false;

  private username = "";
  private mode: "followers" | "following" = "followers";
  private oldestDate = new Date();

  constructor(private userService: UserService) {}

  showDialog(username: string, mode: "followers" | "following") {
    this.username = username;
    this.mode = mode;
    this.title = mode === "followers" ? FOLLOWERS_TITLE : FOLLOWING_TITLE;
    this.entries = [];
    this.oldestDate = new Date();
    this.noMore = false;
    this.loadError = false;
    this.visible = true;
    this.loadMore();
  }

  hideDialog() {
    this.visible = false;
  }

  onScroll() {
    const el = this.scrollable.nativeElement;
    const atBottom = el.scrollTop + el.clientHeight > el.scrollHeight - 40;
    if (atBottom && !this.working && !this.noMore) this.loadMore();
  }

  loadMore() {
    this.working = true;
    this.loadError = false;
    const request$ =
      this.mode === "followers"
        ? this.userService.getFollowers(this.username, this.oldestDate)
        : this.userService.getFollowing(this.username, this.oldestDate);

    request$.subscribe({
      next: (response: FollowListResponse) => {
        this.working = false;
        this.oldestDate = new Date(response.oldest);
        this.entries = this.entries.concat(response.users);
        if (response.remaining === 0) this.noMore = true;
      },
      error: () => {
        this.working = false;
        this.loadError = true;
      },
    });
  }
}
