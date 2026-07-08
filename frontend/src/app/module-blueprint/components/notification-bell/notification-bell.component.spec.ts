import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { By } from "@angular/platform-browser";
import { RouterTestingModule } from "@angular/router/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { PopoverModule } from "primeng/popover";
import { of, throwError } from "rxjs";

import { NotificationBellComponent } from "./notification-bell.component";
import { NotificationService } from "src/app/module-blueprint/services/notification.service";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";

function makeResponse(
  notifications: any[] = [],
  unreadCount = 0,
  remaining = 0
) {
  return {
    notifications,
    unreadCount,
    oldest: new Date("2026-01-01").toISOString(),
    remaining,
  };
}

describe("NotificationBellComponent", () => {
  let component: NotificationBellComponent;
  let fixture: ComponentFixture<NotificationBellComponent>;
  let notificationService: any;
  let authService: any;

  beforeEach(async () => {
    notificationService = {
      list: vi.fn().mockReturnValue(of(makeResponse())),
      markAllRead: vi.fn().mockReturnValue(of({ markRead: "OK" })),
    };
    authService = { isLoggedIn: vi.fn().mockReturnValue(true) };

    await TestBed.configureTestingModule({
      declarations: [NotificationBellComponent],
      imports: [
        RouterTestingModule.withRoutes([]),
        PopoverModule,
        NoopAnimationsModule,
      ],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: NotificationService, useValue: notificationService },
        { provide: AuthenticationService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
  });

  it("creates", () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it("polls unread count on init when logged in", () => {
    notificationService.list.mockReturnValue(of(makeResponse([], 3)));
    fixture.detectChanges();
    expect(notificationService.list).toHaveBeenCalled();
    expect(component.unreadCount).toBe(3);
  });

  it("does not poll when logged out", () => {
    authService.isLoggedIn.mockReturnValue(false);
    fixture.detectChanges();
    expect(notificationService.list).not.toHaveBeenCalled();
  });

  it("shows a 9+ badge once unread count exceeds 9", () => {
    notificationService.list.mockReturnValue(of(makeResponse([], 15)));
    fixture.detectChanges();
    const badge = fixture.debugElement.query(By.css(".notification-badge"));
    expect(badge.nativeElement.textContent.trim()).toBe("9+");
  });

  it("hides the badge when unreadCount is 0", () => {
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css(".notification-badge"))
    ).toBeNull();
  });

  describe("onShow", () => {
    it("loads notifications, zeroes the badge, and marks all read", () => {
      fixture.detectChanges();
      notificationService.list.mockReturnValue(
        of(
          makeResponse(
            [
              {
                id: "n1",
                type: "like",
                actorUsername: "alice",
                blueprintId: "bp1",
                blueprintName: "Coal Setup",
                commentId: null,
                createdAt: new Date().toISOString(),
                read: false,
              },
            ],
            1
          )
        )
      );
      component.onShow();

      expect(component.notifications).toHaveLength(1);
      expect(component.unreadCount).toBe(0);
      expect(notificationService.markAllRead).toHaveBeenCalled();
    });

    it("flags loadError on failure", () => {
      fixture.detectChanges();
      notificationService.list.mockReturnValue(
        throwError(() => new Error("network"))
      );
      component.onShow();
      expect(component.loadError).toBe(true);
      expect(component.working).toBe(false);
    });
  });

  describe("message", () => {
    const base = {
      id: "n1",
      actorUsername: "alice",
      blueprintId: "bp1",
      blueprintName: null,
      commentId: null,
      createdAt: new Date().toISOString(),
      read: false,
    };

    it("composes a message per notification type", () => {
      expect(component.message({ ...base, type: "comment" } as any)).toContain(
        "commented on your blueprint"
      );
      expect(component.message({ ...base, type: "reply" } as any)).toContain(
        "replied to your comment"
      );
      expect(component.message({ ...base, type: "like" } as any)).toContain(
        "liked your blueprint"
      );
      expect(component.message({ ...base, type: "fork" } as any)).toContain(
        "forked your blueprint"
      );
      expect(component.message({ ...base, type: "follow" } as any)).toContain(
        "started following you"
      );
    });
  });

  describe("link/fragment", () => {
    const base = {
      id: "n1",
      actorUsername: "alice",
      createdAt: new Date().toISOString(),
      read: false,
    };

    it("links a follow notification to the actor's profile", () => {
      const n = {
        ...base,
        type: "follow",
        blueprintId: null,
        commentId: null,
      } as any;
      expect(component.link(n)).toEqual(["/profile", "alice"]);
      expect(component.fragment(n)).toBeUndefined();
    });

    it("links a comment notification to the blueprint with a comment fragment", () => {
      const n = {
        ...base,
        type: "comment",
        blueprintId: "bp1",
        commentId: "c1",
      } as any;
      expect(component.link(n)).toEqual(["/blueprint", "bp1"]);
      expect(component.fragment(n)).toBe("comment-c1");
    });

    it("links a like/fork notification to the blueprint with no fragment", () => {
      const n = {
        ...base,
        type: "like",
        blueprintId: "bp1",
        commentId: null,
      } as any;
      expect(component.link(n)).toEqual(["/blueprint", "bp1"]);
      expect(component.fragment(n)).toBeUndefined();
    });
  });

  it("loadMore appends the next page and advances the cursor", () => {
    fixture.detectChanges();
    notificationService.list.mockReturnValue(
      of(
        makeResponse(
          [
            {
              id: "n1",
              type: "like",
              actorUsername: "alice",
              blueprintId: "bp1",
              blueprintName: null,
              commentId: null,
              createdAt: new Date().toISOString(),
              read: false,
            },
          ],
          0,
          1
        )
      )
    );
    component.onShow();
    expect(component.notifications).toHaveLength(1);
    expect(component.remaining).toBe(1);

    notificationService.list.mockReturnValue(
      of(
        makeResponse(
          [
            {
              id: "n2",
              type: "follow",
              actorUsername: "bob",
              blueprintId: null,
              blueprintName: null,
              commentId: null,
              createdAt: new Date().toISOString(),
              read: false,
            },
          ],
          0,
          0
        )
      )
    );
    component.loadMore();
    expect(component.notifications).toHaveLength(2);
    expect(component.remaining).toBe(0);
  });
});
