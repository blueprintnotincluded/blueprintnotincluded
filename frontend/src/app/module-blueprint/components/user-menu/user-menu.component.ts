import {
  Component,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { Menu } from "primeng/menu";
import { MenuItem, MessageService } from "primeng/api";
import { Router } from "@angular/router";
import { AuthenticationService } from "../../services/authentification-service";

export interface BrowseData {
  filterUserId: string;
  filterUserName: string;
}

@Component({
  selector: "app-user-menu",
  templateUrl: "./user-menu.component.html",
  styleUrls: ["./user-menu.component.css"],
  standalone: false,
})
export class UserMenuComponent implements OnInit {
  @ViewChild("userMenu") userMenu!: Menu;

  @Output() sendFeedback = new EventEmitter<void>();
  @Output() myBlueprintsRequested = new EventEmitter<BrowseData>();

  userMenuItems!: MenuItem[];
  isAdmin = false;
  private logoutSuccessMsg!: string;

  constructor(
    public authService: AuthenticationService,
    private messageService: MessageService,
    private router: Router
  ) {}

  ngOnInit() {
    this.logoutSuccessMsg = $localize`Logout Successful`;
    this.isAdmin = this.authService.getUserDetails()?.role === "admin";

    const loggedIn = this.authService.isLoggedIn();
    this.userMenuItems = [
      {
        label: $localize`Sign in`,
        icon: "pi pi-sign-in",
        command: () => this.login(),
        visible: !loggedIn,
      },
      {
        label: $localize`My Blueprints`,
        icon: "pi pi-images",
        command: () => this.userProfile(),
        visible: loggedIn,
      },
      {
        label: $localize`Switch account`,
        icon: "pi pi-refresh",
        command: () => this.switchAccount(),
        visible: loggedIn,
      },
      { separator: true },
      {
        label: $localize`Send Feedback`,
        icon: "pi pi-comment",
        command: () => this.sendFeedback.emit(),
      },
      {
        label: $localize`Admin Panel`,
        icon: "pi pi-shield",
        url: "/admin",
        visible: this.isAdmin,
      },
      { separator: true },
      {
        label: $localize`Log out`,
        icon: "pi pi-sign-out",
        command: () => this.logout(),
        visible: loggedIn,
      },
    ];
  }

  userProfile() {
    const user = this.authService.getUserDetails();
    if (!user) return;
    this.myBlueprintsRequested.emit({
      filterUserId: user._id,
      filterUserName: user.username,
    });
  }

  login() {
    this.router.navigate(["/login"]);
  }

  switchAccount() {
    this.authService.logout();
    this.router.navigate(["/login"]);
  }

  toggleAlpha() {
    this.authService.toggleAlpha().subscribe({
      next: (token: string) => {
        this.authService.saveToken(token);
        this.router.navigate(["/"]);
      },
    });
  }

  logout() {
    this.authService.logout();
    this.messageService.add({
      severity: "success",
      summary: this.logoutSuccessMsg,
      detail: undefined,
    });
  }
}
