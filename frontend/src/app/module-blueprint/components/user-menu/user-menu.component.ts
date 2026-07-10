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

  @Output() about = new EventEmitter<void>();
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
      { separator: true, visible: loggedIn },
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
        label: $localize`About`,
        icon: "pi pi-info-circle",
        command: () => this.about.emit(),
      },
      {
        label: $localize`Discord`,
        icon: "fab fa-discord",
        url: "https://discord.gg/9gYwKaRujK",
        target: "discord",
      },
      {
        label: $localize`Github`,
        icon: "fab fa-github",
        url: "https://github.com/Sinetheta/blueprintnotincluded",
        target: "github",
      },
      { separator: true, visible: loggedIn },
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
