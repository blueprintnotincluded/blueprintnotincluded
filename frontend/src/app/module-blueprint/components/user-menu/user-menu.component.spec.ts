import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { Router } from "@angular/router";
import { MessageService } from "primeng/api";

import { UserMenuComponent, BrowseData } from "./user-menu.component";
import {
  AuthenticationService,
  UserDetails,
} from "src/app/module-blueprint/services/authentification-service";

function makeUser(role: "user" | "admin" = "user"): UserDetails {
  return {
    _id: "u1",
    email: "alice@example.com",
    username: "alice",
    exp: 9999999999,
    role,
  };
}

describe("UserMenuComponent", () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;
  let authService: any;
  let router: any;
  let messageService: any;

  beforeEach(async () => {
    authService = {
      isLoggedIn: vi.fn(),
      getUserDetails: vi.fn(),
      logout: vi.fn(),
    };
    router = { navigate: vi.fn() };
    messageService = { add: vi.fn() };

    authService.getUserDetails.mockReturnValue(null);
    authService.isLoggedIn.mockReturnValue(false);

    await TestBed.configureTestingModule({
      declarations: [UserMenuComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: MessageService, useValue: messageService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  describe("user menu items", () => {
    it("hides admin items for non-admin users", () => {
      authService.getUserDetails.mockReturnValue(makeUser("user"));
      component.ngOnInit();
      const adminItem = component.userMenuItems.find(
        (i) => i.label === "Admin Panel"
      );
      expect(adminItem?.visible).toBe(false);
    });

    it("shows admin items for admin users", () => {
      authService.getUserDetails.mockReturnValue(makeUser("admin"));
      component.ngOnInit();
      const adminItem = component.userMenuItems.find(
        (i) => i.label === "Admin Panel"
      );
      expect(adminItem?.visible).toBe(true);
    });
  });

  describe("sendFeedback output", () => {
    it("emits when Send Feedback menu item is clicked", () => {
      vi.spyOn(component.sendFeedback, "emit");
      const item = component.userMenuItems.find((i) =>
        i.label?.includes("Feedback")
      );
      item!.command!({} as any);
      expect(component.sendFeedback.emit).toHaveBeenCalled();
    });
  });

  describe("myBlueprintsRequested output", () => {
    it("emits BrowseData for the current user", () => {
      authService.getUserDetails.mockReturnValue(makeUser("user"));
      vi.spyOn(component.myBlueprintsRequested, "emit");
      component.userProfile();
      const expected: BrowseData = {
        filterUserId: "u1",
        filterUserName: "alice",
      };
      expect(component.myBlueprintsRequested.emit).toHaveBeenCalledWith(
        expected
      );
    });

    it("does nothing when no user is logged in", () => {
      authService.getUserDetails.mockReturnValue(null);
      vi.spyOn(component.myBlueprintsRequested, "emit");
      component.userProfile();
      expect(component.myBlueprintsRequested.emit).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("calls authService.logout and adds success toast", () => {
      component.logout();
      expect(authService.logout).toHaveBeenCalled();
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "success" })
      );
    });
  });

  describe("switchAccount", () => {
    it("logs out and navigates to login", () => {
      component.switchAccount();
      expect(authService.logout).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(["/login"]);
    });
  });
});
