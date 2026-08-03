import { Component, OnInit } from "@angular/core";
import { ThemeService } from "./module-blueprint/services/theme.service";
import { AuthenticationService } from "./module-blueprint/services/authentification-service";

@Component({
  standalone: false,
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit {
  title = "blueprintnotincluded";

  constructor(
    private themeService: ThemeService,
    private authService: AuthenticationService,
  ) {}

  ngOnInit(): void {
    // Local first and synchronously, so the first paint is already the right
    // palette; the account copy overrides it a moment later when it lands.
    this.themeService.initFromLocal();
    if (this.authService.isLoggedIn()) {
      this.themeService.loadForUser().subscribe({ error: () => {} });
    }
  }
}
