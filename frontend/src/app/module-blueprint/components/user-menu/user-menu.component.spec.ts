import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { Router } from "@angular/router";
import { of } from "rxjs";
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
  let authService: jasmine.SpyObj<AuthenticationService>;
  let router: jasmine.SpyObj<Router>;
  let messageService: jasmine.SpyObj<MessageService>;

  beforeEach(waitForAsync(() => {
    authService = jasmine.createSpyObj("AuthenticationService", [
      "isLoggedIn",
      "getUserDetails",
      "isAlpha",
      "logout",
      "toggleAlpha",
      "saveToken",
    ]);
    router = jasmine.createSpyObj("Router", ["navigate"]);
    messageService = jasmine.createSpyObj("MessageService", ["add"]);

    authService.getUserDetails.and.returnValue(null);
    authService.isAlpha.and.returnValue(false);
    authService.isLoggedIn.and.returnValue(false);

    TestBed.configureTestingModule({
      declarations: [UserMenuComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthenticationService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: MessageService, useValue: messageService },
      ],
    }).compileComponents();
  }));

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
      authService.getUserDetails.and.returnValue(makeUser("user"));
      component.ngOnInit();
      const adminItem = component.userMenuItems.find(
        (i) => i.label === "Admin Panel"
      );
      expect(adminItem?.visible).toBeFalse();
    });

    it("shows admin items for admin users", () => {
      authService.getUserDetails.and.returnValue(makeUser("admin"));
      component.ngOnInit();
      const adminItem = component.userMenuItems.find(
        (i) => i.label === "Admin Panel"
      );
      expect(adminItem?.visible).toBeTrue();
    });

    it('shows "Enter Alpha" label when not alpha', () => {
      authService.getUserDetails.and.returnValue(makeUser("admin"));
      authService.isAlpha.and.returnValue(false);
      component.ngOnInit();
      const alphaItem = component.userMenuItems.find((i) =>
        i.label?.includes("Enter Alpha")
      );
      expect(alphaItem).toBeTruthy();
    });

    it('shows "Exit Alpha" label when already alpha', () => {
      authService.getUserDetails.and.returnValue(makeUser("admin"));
      authService.isAlpha.and.returnValue(true);
      component.ngOnInit();
      const alphaItem = component.userMenuItems.find((i) =>
        i.label?.includes("Exit Alpha")
      );
      expect(alphaItem).toBeTruthy();
    });
  });

  describe("sendFeedback output", () => {
    it("emits when Send Feedback menu item is clicked", () => {
      spyOn(component.sendFeedback, "emit");
      const item = component.userMenuItems.find((i) =>
        i.label?.includes("Feedback")
      );
      item!.command!({} as any);
      expect(component.sendFeedback.emit).toHaveBeenCalled();
    });
  });

  describe("myBlueprintsRequested output", () => {
    it("emits BrowseData for the current user", () => {
      authService.getUserDetails.and.returnValue(makeUser("user"));
      spyOn(component.myBlueprintsRequested, "emit");
      component.userProfile();
      const expected: BrowseData = {
        filterUserId: "u1",
        filterUserName: "alice",
        getDuplicates: true,
      };
      expect(component.myBlueprintsRequested.emit).toHaveBeenCalledWith(
        expected
      );
    });

    it("does nothing when no user is logged in", () => {
      authService.getUserDetails.and.returnValue(null);
      spyOn(component.myBlueprintsRequested, "emit");
      component.userProfile();
      expect(component.myBlueprintsRequested.emit).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("calls authService.logout and adds success toast", () => {
      component.logout();
      expect(authService.logout).toHaveBeenCalled();
      expect(messageService.add).toHaveBeenCalledWith(
        jasmine.objectContaining({ severity: "success" })
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

  describe("toggleAlpha", () => {
    it("saves new token and navigates to root", () => {
      authService.toggleAlpha.and.returnValue(of("new-token"));
      component.toggleAlpha();
      expect(authService.saveToken).toHaveBeenCalledWith("new-token");
      expect(router.navigate).toHaveBeenCalledWith(["/"]);
    });
  });
});
