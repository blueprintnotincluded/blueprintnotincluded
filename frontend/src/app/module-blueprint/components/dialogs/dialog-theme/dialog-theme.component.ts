import { Component } from "@angular/core";
import { ThemeService, ThemeOption } from "../../../services/theme.service";
import { AuthenticationService } from "../../../services/authentification-service";
import { ThemeId } from "../../../../../../../lib/index";

@Component({
  selector: "app-dialog-theme",
  templateUrl: "./dialog-theme.component.html",
  styleUrls: ["./dialog-theme.component.css"],
  standalone: false,
})
export class DialogThemeComponent {
  visible = false;

  constructor(
    public themeService: ThemeService,
    private authService: AuthenticationService,
  ) {}

  get themes(): ThemeOption[] {
    return this.themeService.themes;
  }

  get current(): ThemeId {
    return this.themeService.current;
  }

  get loggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  // Applied on click, not on a Save button: the dialog sits over the page it is
  // restyling, so the preview and the commit are the same gesture.
  select(id: ThemeId): void {
    this.themeService.select(id, this.loggedIn);
  }

  open(): void {
    this.visible = true;
  }

  toggleDialog(): void {
    this.visible = !this.visible;
  }
}
