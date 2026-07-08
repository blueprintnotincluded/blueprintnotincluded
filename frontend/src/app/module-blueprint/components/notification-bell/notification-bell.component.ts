import { Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { Popover } from "primeng/popover";
import { Subscription, interval } from "rxjs";
import { switchMap, startWith } from "rxjs/operators";
import { NotificationDto } from "../../../../../../lib/index";
import { NotificationService } from "../../services/notification.service";
import { AuthenticationService } from "../../services/authentification-service";

const POLL_INTERVAL_MS = 45000;

@Component({
  selector: "app-notification-bell",
  templateUrl: "./notification-bell.component.html",
  styleUrls: ["./notification-bell.component.css"],
  standalone: false,
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  @ViewChild("notifPanel") notifPanel!: Popover;

  unreadCount = 0;
  notifications: NotificationDto[] = [];
  working = false;
  loadError = false;
  remaining = 0;
  private oldestDate = new Date();
  private pollSub?: Subscription;

  constructor(
    private notificationService: NotificationService,
    public authService: AuthenticationService
  ) {}

  ngOnInit() {
    if (!this.authService.isLoggedIn()) return;
    this.pollSub = interval(POLL_INTERVAL_MS)
      .pipe(
        startWith(0),
        switchMap(() => this.notificationService.list(new Date()))
      )
      .subscribe({
        next: (response) => {
          this.unreadCount = response.unreadCount;
        },
        error: () => {},
      });
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  toggle(event: Event) {
    this.notifPanel.toggle(event);
  }

  hidePanel() {
    this.notifPanel.hide();
  }

  onShow() {
    this.working = true;
    this.loadError = false;
    this.oldestDate = new Date();
    this.notificationService.list(this.oldestDate).subscribe({
      next: (response) => {
        this.working = false;
        this.notifications = response.notifications;
        this.remaining = response.remaining;
        this.oldestDate = new Date(response.oldest);
        this.unreadCount = 0;
        this.notificationService.markAllRead().subscribe({ error: () => {} });
      },
      error: () => {
        this.working = false;
        this.loadError = true;
      },
    });
  }

  loadMore() {
    this.working = true;
    this.notificationService.list(this.oldestDate).subscribe({
      next: (response) => {
        this.working = false;
        this.notifications = this.notifications.concat(response.notifications);
        this.remaining = response.remaining;
        this.oldestDate = new Date(response.oldest);
      },
      error: () => {
        this.working = false;
      },
    });
  }

  message(n: NotificationDto): string {
    switch (n.type) {
      case "comment":
        return $localize`${n.actorUsername} commented on your blueprint`;
      case "reply":
        return $localize`${n.actorUsername} replied to your comment`;
      case "like":
        return $localize`${n.actorUsername} liked your blueprint`;
      case "fork":
        return $localize`${n.actorUsername} forked your blueprint`;
      case "follow":
        return $localize`${n.actorUsername} started following you`;
    }
  }

  link(n: NotificationDto): any[] {
    if (n.type === "follow") return ["/profile", n.actorUsername];
    if (n.blueprintId == null) return [];
    return ["/blueprint", n.blueprintId];
  }

  fragment(n: NotificationDto): string | undefined {
    if ((n.type === "comment" || n.type === "reply") && n.commentId != null) {
      return "comment-" + n.commentId;
    }
    return undefined;
  }
}
