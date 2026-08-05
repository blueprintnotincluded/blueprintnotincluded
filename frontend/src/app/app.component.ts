import { Component, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";
import { ThemeService } from "./module-blueprint/services/theme.service";
import { ContentLocaleService } from "./module-blueprint/services/content-locale.service";
import { AuthenticationService } from "./module-blueprint/services/authentification-service";

@Component({
  standalone: false,
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit, OnDestroy {
  title = "blueprintnotincluded";

  private sessionSubscription: Subscription | null = null;

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
      this.loadAccountState();
    }
    // Login completes via an in-SPA route navigation
    // (login-page/magic-callback/etc. all `router.navigate(["/"])`), never a
    // full page reload — so a session that starts AFTER this component has
    // already run its one-shot init above needs its own signal, or account
    // state (and the content locale's adopt-local-declaration-into-account
    // step) never loads until the next hard refresh.
    this.sessionSubscription = this.authService.sessionEstablished$.subscribe(
      () => this.loadAccountState(),
    );
  }

  ngOnDestroy(): void {
    this.sessionSubscription?.unsubscribe();
    this.sessionSubscription = null;
  }

  private loadAccountState(): void {
    this.themeService.loadForUser().subscribe({ error: () => {} });
    this.contentLocaleService.loadForUser().subscribe({ error: () => {} });
  }
}
