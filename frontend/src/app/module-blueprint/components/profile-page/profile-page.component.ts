import { Component, HostListener, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { DatePipe } from "@angular/common";
import { UserService } from "../../services/user-service";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";
import {
  BlueprintListItem,
  BlueprintListResponse,
  ProfileResponse,
} from "../../../../../../lib/index";

const LOADING_STR = $localize`Loading...`;
const NO_RESULTS_STR = $localize`:profile.noResults:No blueprints yet`;
const FOLLOW_LABEL = $localize`:profile.follow:Follow`;
const UNFOLLOW_LABEL = $localize`:profile.unfollow:Unfollow`;
const LOGIN_PROMPT = $localize`:profile.loginToFollow:Log in to follow`;

@Component({
  selector: "app-profile-page",
  templateUrl: "./profile-page.component.html",
  styleUrls: ["./profile-page.component.css"],
  standalone: false,
})
export class ProfilePageComponent implements OnInit {
  username = "";
  profile: ProfileResponse | null = null;
  loadingProfile = true;
  notFound = false;
  followWorking = false;

  editingBio = false;
  bioDraft = "";
  savingBio = false;

  blueprintListItems: BlueprintListItem[] = [];
  working = true;
  noMoreBlueprints = false;
  oldestDate = new Date();
  remaining = 0;
  activeTab: "blueprints" | "liked" = "blueprints";

  loadingBlueprintItem: BlueprintListItem;
  nothingBlueprintItem: BlueprintListItem;

  readonly followLabel = FOLLOW_LABEL;
  readonly unfollowLabel = UNFOLLOW_LABEL;
  readonly loginPromptText = LOGIN_PROMPT;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private blueprintService: BlueprintService,
    public authService: AuthenticationService,
    public datepipe: DatePipe
  ) {
    const tempDate = new Date();
    this.loadingBlueprintItem = {
      id: null as any,
      name: LOADING_STR,
      ownerId: "",
      ownerName: LOADING_STR,
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg",
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
      commentCount: 0,
      nbForks: 0,
    };

    this.nothingBlueprintItem = {
      id: null as any,
      name: NO_RESULTS_STR,
      ownerId: "",
      ownerName: "",
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg_nothing",
      likedByMe: false,
      ownedByMe: false,
      nbLikes: 0,
      commentCount: 0,
      nbForks: 0,
    };
  }

  goToProfile(data: { filterUserName: string }) {
    this.router.navigate(["/profile", data.filterUserName]);
  }

  ngOnInit() {
    this.route.paramMap.subscribe((paramMap) => {
      this.username = paramMap.get("username") ?? "";
      this.resetProfileState();
      this.appendLoading();
      this.loadProfile();
    });
  }

  private resetProfileState() {
    this.profile = null;
    this.loadingProfile = true;
    this.notFound = false;
    this.followWorking = false;
    this.editingBio = false;
    this.bioDraft = "";
    this.savingBio = false;
    this.blueprintListItems = [];
    this.working = true;
    this.noMoreBlueprints = false;
    this.oldestDate = new Date();
    this.remaining = 0;
    this.activeTab = "blueprints";
  }

  get isOwnProfile(): boolean {
    return (
      this.loggedIn &&
      this.authService.getUserDetails()?.username === this.username
    );
  }

  get loggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  get avatarLetter(): string {
    return this.username.charAt(0).toUpperCase();
  }

  loadProfile() {
    this.loadingProfile = true;
    this.notFound = false;
    this.userService.getProfile(this.username).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.bioDraft = profile.bio;
        this.loadingProfile = false;
        this.loadBlueprints();
      },
      error: () => {
        this.loadingProfile = false;
        this.notFound = true;
        this.working = false;
        this.blueprintListItems = [];
      },
    });
  }

  toggleFollow() {
    if (!this.profile || this.followWorking) return;
    const nextFollowed = !this.profile.followedByMe;

    // Optimistic, mirroring like-widget
    this.profile.followedByMe = nextFollowed;
    this.profile.followerCount += nextFollowed ? 1 : -1;
    this.followWorking = true;

    this.userService.follow(this.profile.id, nextFollowed).subscribe({
      next: () => {
        this.followWorking = false;
      },
      error: () => {
        // Roll back on failure
        if (!this.profile) return;
        this.profile.followedByMe = !nextFollowed;
        this.profile.followerCount += nextFollowed ? -1 : 1;
        this.followWorking = false;
      },
    });
  }

  startEditingBio() {
    if (!this.profile) return;
    this.bioDraft = this.profile.bio;
    this.editingBio = true;
  }

  cancelEditingBio() {
    this.editingBio = false;
  }

  saveBio() {
    if (!this.profile || this.savingBio) return;
    this.savingBio = true;
    this.userService.updateBio(this.bioDraft).subscribe({
      next: (result) => {
        if (this.profile) this.profile.bio = result.bio;
        this.savingBio = false;
        this.editingBio = false;
      },
      error: () => {
        this.savingBio = false;
      },
    });
  }

  @HostListener("window:scroll")
  onWindowScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total = document.documentElement.scrollHeight;
    if (!this.noMoreBlueprints && !this.working && scrolled > total - 300) {
      this.loadMore();
    }
  }

  setTab(tab: "blueprints" | "liked") {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.blueprintListItems = [];
    this.working = true;
    this.noMoreBlueprints = false;
    this.oldestDate = new Date();
    this.remaining = 0;
    this.appendLoading();
    this.loadBlueprints();
  }

  loadBlueprints() {
    if (!this.profile) return;
    const request$ =
      this.activeTab === "liked"
        ? this.blueprintService.getBlueprints(
            this.oldestDate,
            null,
            null,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            this.profile.id
          )
        : this.blueprintService.getBlueprints(
            this.oldestDate,
            this.profile.id,
            null
          );

    request$.subscribe({
      next: (r: any) => this.handleGetBlueprints(r),
      error: () => {
        this.working = false;
      },
    });
  }

  handleGetBlueprints(response: BlueprintListResponse) {
    this.working = false;
    this.oldestDate = new Date(response.oldest);
    this.remaining = response.remaining;
    if (this.remaining === 0) this.noMoreBlueprints = true;

    this.blueprintListItems = this.blueprintListItems.filter(
      (i) => i !== this.loadingBlueprintItem
    );
    response.blueprints.forEach((item) => this.blueprintListItems.push(item));

    if (this.blueprintListItems.length === 0)
      this.blueprintListItems.push(this.nothingBlueprintItem);
  }

  loadMore() {
    this.working = true;
    this.appendLoading();
    this.loadBlueprints();
  }

  appendLoading() {
    for (let i = 0; i < 6; i++)
      this.blueprintListItems.push(this.loadingBlueprintItem);
  }
}
