import { Component, HostListener, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { DatePipe } from "@angular/common";
import { UserService } from "../../services/user-service";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";
import {
  AvatarCandidate,
  BlueprintListItem,
  BlueprintListResponse,
  ProfileResponse,
} from "../../../../../../lib/index";

const LOADING_STR = $localize`Loading...`;
const NO_RESULTS_STR = $localize`:profile.noResults:No blueprints yet`;
const FOLLOW_LABEL = $localize`:profile.follow:Follow`;
const UNFOLLOW_LABEL = $localize`:profile.unfollow:Unfollow`;
const LOGIN_PROMPT = $localize`:profile.loginToFollow:Log in to follow`;
const AVATAR_LOAD_ERROR = $localize`:profile.avatarLoadError:Could not load avatars`;
const AVATAR_LIMIT_ERROR = $localize`:profile.avatarLimit:You can generate one avatar per day — come back tomorrow`;
const AVATAR_GENERATE_ERROR = $localize`:profile.avatarGenerateError:Avatar generation failed, please try again`;
const AVATAR_SELECT_ERROR = $localize`:profile.avatarSelectError:That avatar was just taken — pick another`;

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

  // Own-profile avatar management (lazy: nothing loads until the panel opens)
  avatarPanelOpen = false;
  avatarLoading = false;
  nextGenerateAt: Date | null = null;
  poolCount = 0;
  availableAvatars: AvatarCandidate[] = [];
  candidates: AvatarCandidate[] = [];
  generating = false;
  selectingAvatarId: string | null = null;
  avatarError = "";
  seedFile: File | null = null;

  blueprintListItems: BlueprintListItem[] = [];
  working = true;
  noMoreBlueprints = false;
  // null = first page ("older than now" server-side); keeps page-1 URLs stable
  oldestDate: Date | null = null;
  remaining = 0;
  activeTab: "blueprints" | "rated" = "blueprints";

  loadingBlueprintItem: BlueprintListItem;
  nothingBlueprintItem: BlueprintListItem;

  readonly followLabel = FOLLOW_LABEL;
  readonly unfollowLabel = UNFOLLOW_LABEL;
  readonly loginPromptText = LOGIN_PROMPT;
  readonly generateRandomLabel = $localize`:profile.generateRandom:Generate random`;
  readonly generateFromPhotoLabel = $localize`:profile.generateFromPhoto:Generate from photo`;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private blueprintService: BlueprintService,
    public authService: AuthenticationService,
    public datepipe: DatePipe,
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
      isPublished: true,
      nbRatings: 0,
      rating: 0,
      commentCount: 0,
      nbForks: 0,
      nbViews: 0,
      nbDownloads: 0,
    };

    this.nothingBlueprintItem = {
      id: null as any,
      name: NO_RESULTS_STR,
      ownerId: "",
      ownerName: "",
      createdAt: tempDate,
      modifiedAt: tempDate,
      thumbnail: "svg_nothing",
      isPublished: true,
      nbRatings: 0,
      rating: 0,
      commentCount: 0,
      nbForks: 0,
      nbViews: 0,
      nbDownloads: 0,
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
    this.avatarPanelOpen = false;
    this.avatarLoading = false;
    this.nextGenerateAt = null;
    this.poolCount = 0;
    this.availableAvatars = [];
    this.candidates = [];
    this.generating = false;
    this.selectingAvatarId = null;
    this.avatarError = "";
    this.seedFile = null;
    this.blueprintListItems = [];
    this.working = true;
    this.noMoreBlueprints = false;
    this.oldestDate = null;
    this.remaining = 0;
    this.activeTab = "blueprints";
  }

  // Loaded drafts on the blueprints tab — feeds the "waiting to be shared"
  // publish nudge (own profile only; the API never returns others' drafts)
  get draftCount(): number {
    return this.blueprintListItems.filter((item) => item.isPublished === false)
      .length;
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

  // Immutable per-id URL — assignment changes swap the id, so no cache issues
  get avatarUrl(): string | null {
    return this.profile?.avatarId
      ? `/api/avatars/${this.profile.avatarId}/image`
      : null;
  }

  get canGenerate(): boolean {
    return this.nextGenerateAt == null || this.nextGenerateAt <= new Date();
  }

  toggleAvatarPanel() {
    this.avatarPanelOpen = !this.avatarPanelOpen;
    if (this.avatarPanelOpen) this.refreshAvatarPanel();
  }

  private refreshAvatarPanel() {
    this.avatarLoading = true;
    this.avatarError = "";
    this.userService.getAvatarStatus().subscribe({
      next: (status) => {
        this.nextGenerateAt = status.nextGenerateAt
          ? new Date(status.nextGenerateAt)
          : null;
        this.poolCount = status.poolCount;
      },
      error: () => {},
    });
    this.userService.getAvailableAvatars().subscribe({
      next: (available) => {
        this.availableAvatars = available.avatars;
        this.poolCount = available.total;
        this.avatarLoading = false;
      },
      error: () => {
        this.avatarLoading = false;
        this.avatarError = AVATAR_LOAD_ERROR;
      },
    });
  }

  onSeedFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.seedFile = input.files?.[0] ?? null;
  }

  generateAvatar() {
    if (!this.canGenerate || this.generating) return;
    this.generating = true;
    this.avatarError = "";
    this.userService.generateAvatar(this.seedFile).subscribe({
      next: (result) => {
        this.generating = false;
        this.seedFile = null;
        this.candidates = result.candidates;
        if (this.profile && result.avatarId)
          this.profile.avatarId = result.avatarId;
        this.refreshAvatarPanel();
      },
      error: (err) => {
        this.generating = false;
        const retryAt = err?.error?.retryAt;
        if (retryAt) this.nextGenerateAt = new Date(retryAt);
        this.avatarError =
          err?.status === 429 ? AVATAR_LIMIT_ERROR : AVATAR_GENERATE_ERROR;
      },
    });
  }

  chooseAvatar(candidate: AvatarCandidate) {
    if (this.selectingAvatarId) return;
    this.selectingAvatarId = candidate.id;
    this.avatarError = "";
    this.userService.selectAvatar(candidate.id).subscribe({
      next: () => {
        this.selectingAvatarId = null;
        if (this.profile) this.profile.avatarId = candidate.id;
        // The claimed avatar left the pool; a released one may have joined it
        this.refreshAvatarPanel();
      },
      error: () => {
        this.selectingAvatarId = null;
        this.avatarError = AVATAR_SELECT_ERROR;
      },
    });
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

    // Optimistic, mirroring the rating widget
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

  setTab(tab: "blueprints" | "rated") {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.blueprintListItems = [];
    this.working = true;
    this.noMoreBlueprints = false;
    this.oldestDate = null;
    this.remaining = 0;
    this.appendLoading();
    this.loadBlueprints();
  }

  loadBlueprints() {
    if (!this.profile) return;
    const request$ =
      this.activeTab === "rated"
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
            this.profile.id,
          )
        : this.blueprintService.getBlueprints(
            this.oldestDate,
            this.profile.id,
            null,
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
      (i) => i !== this.loadingBlueprintItem,
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
