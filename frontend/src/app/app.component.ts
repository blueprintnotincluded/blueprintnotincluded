import { Component, OnInit } from "@angular/core";
import { ThemeService } from "./module-blueprint/services/theme.service";
import { ContentLocaleService } from "./module-blueprint/services/content-locale.service";
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
    private contentLocaleService: ContentLocaleService,
    private authService: AuthenticationService,
  ) {}

  ngOnInit(): void {
    // Local first and synchronously, so the first paint is already the right
    // palette; the account copy overrides it a moment later when it lands.
    this.themeService.initFromLocal();
    // Same order and the same reason: the content locale decides which title
    // every request asks for, so it must be settled before the first list
    // request goes out, not after.
    this.contentLocaleService.initFromLocal();
    if (this.authService.isLoggedIn()) {
      this.themeService.loadForUser().subscribe({ error: () => {} });
      this.contentLocaleService.loadForUser().subscribe({ error: () => {} });
    }
  }
}
