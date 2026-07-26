import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { of, throwError } from "rxjs";

import { ProfilePageComponent } from "./profile-page.component";
import { UserService } from "../../services/user-service";
import { BlueprintService } from "../../services/blueprint-service";
import { AuthenticationService } from "../../services/authentification-service";

function makeProfile(overrides: any = {}) {
  return {
    id: "owner-1",
    username: "alice",
    bio: "",
    memberSince: new Date("2024-01-01").toISOString(),
    blueprintCount: 0,
    followerCount: 0,
    followingCount: 0,
    followedByMe: false,
    ...overrides,
  };
}

function makeBlueprintResponse(blueprints: any[] = [], remaining = 0) {
  return { oldest: new Date("2024-01-01").getTime(), remaining, blueprints };
}

describe("ProfilePageComponent", () => {
  let component: ProfilePageComponent;
  let fixture: ComponentFixture<ProfilePageComponent>;
  let userService: any;
  let blueprintService: any;
  let authService: any;

  beforeEach(async () => {
    userService = {
      getProfile: vi.fn().mockReturnValue(of(makeProfile())),
      follow: vi.fn().mockReturnValue(of({ follow: "OK" })),
      updateBio: vi.fn().mockReturnValue(of({ bio: "updated" })),
      getAvatarStatus: vi
        .fn()
        .mockReturnValue(
          of({ avatarId: null, nextGenerateAt: null, poolCount: 2 }),
        ),
      getAvailableAvatars: vi.fn().mockReturnValue(
        of({
          avatars: [
            { id: "av-1", url: "/api/avatars/av-1/image" },
            { id: "av-2", url: "/api/avatars/av-2/image" },
          ],
          total: 2,
        }),
      ),
      generateAvatar: vi.fn().mockReturnValue(
        of({
          avatarId: "av-new",
          url: "/api/users/alice/avatar",
          candidates: [
            { id: "av-new", url: "/api/avatars/av-new/image" },
            { id: "av-n2", url: "/api/avatars/av-n2/image" },
            { id: "av-n3", url: "/api/avatars/av-n3/image" },
            { id: "av-n4", url: "/api/avatars/av-n4/image" },
          ],
          sourceType: "random",
          faceLikely: null,
        }),
      ),
      selectAvatar: vi
        .fn()
        .mockImplementation((id: string) =>
          of({ avatarId: id, url: "/api/users/alice/avatar" }),
        ),
    };
    blueprintService = {
      getBlueprints: vi.fn().mockReturnValue(of(makeBlueprintResponse())),
    };
    authService = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      getUserDetails: vi.fn().mockReturnValue({ username: "bob" }),
    };

    await TestBed.configureTestingModule({
      declarations: [ProfilePageComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: BlueprintService, useValue: blueprintService },
        { provide: AuthenticationService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ username: "alice" })),
          },
        },
        DatePipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  it("loads the profile for the routed username", () => {
    fixture.detectChanges();
    expect(userService.getProfile).toHaveBeenCalledWith("alice");
    expect(component.profile?.username).toBe("alice");
    expect(component.loadingProfile).toBe(false);
  });

  it("loads that owner's blueprints once the profile resolves", () => {
    fixture.detectChanges();
    expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
      null,
      "owner-1",
      null,
    );
  });

  it("sets notFound and stops loading on a 404", () => {
    userService.getProfile.mockReturnValue(throwError(() => new Error("404")));
    fixture.detectChanges();
    expect(component.notFound).toBe(true);
    expect(component.loadingProfile).toBe(false);
  });

  describe("Liked tab", () => {
    it("is only rendered on the viewer's own profile", () => {
      authService.getUserDetails.mockReturnValue({ username: "bob" });
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css(".view-mode-tabs"))).toBeNull();

      authService.getUserDetails.mockReturnValue({ username: "alice" });
      fixture.detectChanges();
      expect(
        fixture.debugElement.query(By.css(".view-mode-tabs")),
      ).toBeTruthy();
    });

    it("switching to Rated resets the list and requests ratedBy blueprints", () => {
      fixture.detectChanges();
      component.blueprintListItems = [{ name: "stale" } as any];
      blueprintService.getBlueprints.mockClear();

      component.setTab("rated");

      expect(component.activeTab).toBe("rated");
      expect(
        component.blueprintListItems.some((i: any) => i.name === "stale"),
      ).toBe(false);
      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        null,
        null,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "owner-1",
      );
    });

    it("switching back to Blueprints requests owner-filtered blueprints", () => {
      fixture.detectChanges();
      component.setTab("rated");
      blueprintService.getBlueprints.mockClear();

      component.setTab("blueprints");

      expect(blueprintService.getBlueprints).toHaveBeenCalledWith(
        null,
        "owner-1",
        null,
      );
    });

    it("is a no-op when already on the requested tab", () => {
      fixture.detectChanges();
      blueprintService.getBlueprints.mockClear();
      component.setTab("blueprints");
      expect(blueprintService.getBlueprints).not.toHaveBeenCalled();
    });
  });

  it("makes the follower and following counts clickable buttons", () => {
    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css(".profile-meta-link"));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].nativeElement.textContent).toContain("followers");
    expect(buttons[1].nativeElement.textContent).toContain("following");
  });

  describe("isOwnProfile", () => {
    it("is true when the logged-in username matches the route", () => {
      authService.getUserDetails.mockReturnValue({ username: "alice" });
      fixture.detectChanges();
      expect(component.isOwnProfile).toBe(true);
    });

    it("is false for another user's profile", () => {
      authService.getUserDetails.mockReturnValue({ username: "bob" });
      fixture.detectChanges();
      expect(component.isOwnProfile).toBe(false);
    });

    it("is false when logged out even if usernames happen to match", () => {
      authService.isLoggedIn.mockReturnValue(false);
      authService.getUserDetails.mockReturnValue({ username: "alice" });
      fixture.detectChanges();
      expect(component.isOwnProfile).toBe(false);
    });
  });

  describe("toggleFollow", () => {
    it("optimistically flips followedByMe and followerCount, then calls the service", () => {
      fixture.detectChanges();
      component.toggleFollow();

      expect(component.profile?.followedByMe).toBe(true);
      expect(component.profile?.followerCount).toBe(1);
      expect(userService.follow).toHaveBeenCalledWith("owner-1", true);
    });

    it("rolls back on error", () => {
      userService.follow.mockReturnValue(throwError(() => new Error("fail")));
      fixture.detectChanges();
      component.toggleFollow();

      expect(component.profile?.followedByMe).toBe(false);
      expect(component.profile?.followerCount).toBe(0);
    });
  });

  describe("bio editing", () => {
    it("starts editing with the current bio", () => {
      userService.getProfile.mockReturnValue(
        of(makeProfile({ bio: "old bio" })),
      );
      fixture.detectChanges();
      component.startEditingBio();
      expect(component.editingBio).toBe(true);
      expect(component.bioDraft).toBe("old bio");
    });

    it("saves the draft and exits edit mode", () => {
      fixture.detectChanges();
      component.editingBio = true;
      component.bioDraft = "new bio";
      component.saveBio();

      expect(userService.updateBio).toHaveBeenCalledWith("new bio");
      expect(component.profile?.bio).toBe("updated");
      expect(component.editingBio).toBe(false);
    });

    it("cancelEditingBio exits without saving", () => {
      fixture.detectChanges();
      component.editingBio = true;
      component.cancelEditingBio();
      expect(component.editingBio).toBe(false);
      expect(userService.updateBio).not.toHaveBeenCalled();
    });
  });

  describe("avatar display", () => {
    it("uses the immutable image url when the profile has an avatar", () => {
      userService.getProfile.mockReturnValue(
        of(makeProfile({ avatarId: "av-7" })),
      );
      fixture.detectChanges();
      expect(component.avatarUrl).toBe("/api/avatars/av-7/image");
    });

    it("falls back to the letter circle without an avatar", () => {
      fixture.detectChanges();
      expect(component.avatarUrl).toBeNull();
      expect(component.avatarLetter).toBe("A");
    });
  });

  describe("avatar management", () => {
    beforeEach(() => {
      // Own profile
      authService.getUserDetails.mockReturnValue({ username: "alice" });
      fixture.detectChanges();
    });

    it("opening the panel loads status and the available pool", () => {
      component.toggleAvatarPanel();
      expect(component.avatarPanelOpen).toBe(true);
      expect(userService.getAvatarStatus).toHaveBeenCalled();
      expect(userService.getAvailableAvatars).toHaveBeenCalled();
      expect(component.availableAvatars).toHaveLength(2);
      expect(component.poolCount).toBe(2);
      expect(component.canGenerate).toBe(true);
    });

    it("generation is blocked while nextGenerateAt is in the future", () => {
      userService.getAvatarStatus.mockReturnValue(
        of({
          avatarId: null,
          nextGenerateAt: new Date(Date.now() + 60_000).toISOString(),
          poolCount: 2,
        }),
      );
      component.toggleAvatarPanel();
      expect(component.canGenerate).toBe(false);

      component.generateAvatar();
      expect(userService.generateAvatar).not.toHaveBeenCalled();
    });

    it("generateAvatar stores candidates and adopts the assigned avatar", () => {
      component.toggleAvatarPanel();
      component.generateAvatar();

      expect(userService.generateAvatar).toHaveBeenCalledWith(null);
      expect(component.candidates).toHaveLength(4);
      expect(component.profile?.avatarId).toBe("av-new");
    });

    it("shows the daily-limit message on a 429 with retryAt", () => {
      const retryAt = new Date(Date.now() + 3_600_000).toISOString();
      userService.generateAvatar.mockReturnValue(
        throwError(() => ({ status: 429, error: { retryAt } })),
      );
      component.toggleAvatarPanel();
      component.generateAvatar();

      expect(component.avatarError).toContain("per day");
      expect(component.canGenerate).toBe(false);
    });

    it("rejects files with a disallowed type before upload", () => {
      const file = new File(["x"], "cat.gif", { type: "image/gif" });
      const input = document.createElement("input");
      Object.defineProperty(input, "files", { value: [file] });
      component.onSeedFileChange({ target: input } as any);

      expect(component.seedFile).toBeNull();
      expect(component.avatarError).toContain("PNG");
    });

    it("rejects files over the 8 MB limit before upload", () => {
      const file = new File(["x"], "huge.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 9 * 1024 * 1024 });
      const input = document.createElement("input");
      Object.defineProperty(input, "files", { value: [file] });
      component.onSeedFileChange({ target: input } as any);

      expect(component.seedFile).toBeNull();
      expect(component.avatarError).toContain("8");
    });

    it("accepts a valid seed file", () => {
      const file = new File(["x"], "me.jpg", { type: "image/jpeg" });
      const input = document.createElement("input");
      Object.defineProperty(input, "files", { value: [file] });
      component.onSeedFileChange({ target: input } as any);

      expect(component.seedFile).toBe(file);
      expect(component.avatarError).toBe("");
    });

    it("shows the in-progress banner while generating", () => {
      component.toggleAvatarPanel();
      component.generating = true;
      fixture.detectChanges();
      expect(
        fixture.debugElement.query(By.css(".avatar-generating")),
      ).toBeTruthy();
    });

    it("surfaces the server's message on a 400 bad-photo response", () => {
      userService.generateAvatar.mockReturnValue(
        throwError(() => ({
          status: 400,
          error: {
            errors: [{ status: "400", title: "That file could not be read" }],
          },
        })),
      );
      component.toggleAvatarPanel();
      component.generateAvatar();
      expect(component.avatarError).toContain("could not be read");
    });

    it("chooseAvatar claims the avatar and refreshes the pool", () => {
      component.toggleAvatarPanel();
      component.chooseAvatar({ id: "av-2", url: "/api/avatars/av-2/image" });

      expect(userService.selectAvatar).toHaveBeenCalledWith("av-2");
      expect(component.profile?.avatarId).toBe("av-2");
    });

    it("surfaces a friendly error when the avatar was just taken", () => {
      userService.selectAvatar.mockReturnValue(
        throwError(() => ({ status: 409 })),
      );
      component.toggleAvatarPanel();
      component.chooseAvatar({ id: "av-2", url: "/api/avatars/av-2/image" });
      expect(component.avatarError).toContain("taken");
    });
  });
});
