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
  getDuplicates: boolean;
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
  private logoutSuccessMsg!: string;

  constructor(
    public authService: AuthenticationService,
    private messageService: MessageService,
    private router: Router
  ) {}

  ngOnInit() {
    this.logoutSuccessMsg = $localize`Logout Successful`;
    const isAdmin = this.authService.getUserDetails()?.role === "admin";
    const isAlpha = this.authService.isAlpha();

    this.userMenuItems = [
      {
        label: $localize`My Blueprints`,
        icon: "pi pi-images",
        command: () => this.userProfile(),
      },
      {
        label: $localize`Switch account`,
        icon: "pi pi-refresh",
        command: () => this.switchAccount(),
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
        visible: isAdmin,
      },
      {
        label: isAlpha ? $localize`Exit Alpha` : $localize`Enter Alpha`,
        icon: "pi pi-star",
        visible: isAdmin,
        command: () => this.toggleAlpha(),
      },
      { separator: true },
      {
        label: $localize`Log out`,
        icon: "pi pi-sign-out",
        command: () => this.logout(),
      },
    ];
  }

  userProfile() {
    const user = this.authService.getUserDetails();
    if (!user) return;
    this.myBlueprintsRequested.emit({
      filterUserId: user._id,
      filterUserName: user.username,
      getDuplicates: true,
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
