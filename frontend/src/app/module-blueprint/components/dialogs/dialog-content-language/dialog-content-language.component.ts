import { Component, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";
import {
  ContentLocaleService,
  ContentLocaleOption,
} from "../../../services/content-locale.service";
import { AuthenticationService } from "../../../services/authentification-service";

/**
 * The content-language picker (spec/search-followups.md §2.7).
 *
 * Lives in the site nav so it is reachable from every page that has one, and
 * opens off the service's request stream rather than an @Output, so the
 * ambient entry point — the "translated" marker on a details page — can reach
 * it without any component knowing where the dialog is mounted.
 *
 * Selecting is the whole interaction: there is no Save button, because
 * persisting only on interaction is exactly the rule (a default that writes
 * itself is indistinguishable from a choice).
 */
@Component({
  selector: "app-dialog-content-language",
  templateUrl: "./dialog-content-language.component.html",
  styleUrls: ["./dialog-content-language.component.css"],
  standalone: false,
})
export class DialogContentLanguageComponent implements OnInit, OnDestroy {
  visible = false;

  private subscription: Subscription | null = null;

  constructor(
    public localeService: ContentLocaleService,
    private authService: AuthenticationService,
  ) {}

  ngOnInit(): void {
    this.subscription = this.localeService.openRequests$.subscribe(() =>
      this.open(),
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  get options(): readonly ContentLocaleOption[] {
    return this.localeService.options;
  }

  get current(): string {
    return this.localeService.current;
  }

  /**
   * Whether the highlighted row is a real choice or just the browser's
   * language showing through. Worth saying out loud: the row looks identical
   * either way, and a reader who assumes they have chosen will not understand
   * why a new device disagrees.
   */
  get guessed(): boolean {
    return !this.localeService.hasDeclared;
  }

  get loggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  /**
   * Selecting reloads the page. The locale is a request parameter on every
   * read endpoint, so the titles already on screen — cards, the details
   * heading, the related shelf, anything cached in a component — were fetched
   * under the old one. Re-fetching each surface piecemeal is how half a page
   * ends up in one language and half in another; a reload is one line, always
   * correct, and this control is reachable only from pages with no unsaved
   * work (the editor has its own menu and never mounts the site nav).
   */
  select(code: string): void {
    if (code === this.current && this.localeService.hasDeclared) {
      this.visible = false;
      return;
    }
    const accountWrite = this.localeService.select(code, this.loggedIn);
    this.visible = false;
    // A reload cancels an in-flight request, so wait for the account write to
    // settle first. Either outcome reloads: a failed write costs the
    // cross-device copy, not the language the user just picked (which is
    // already in localStorage).
    if (accountWrite == null) {
      this.reload();
      return;
    }
    accountWrite.subscribe({
      next: () => this.reload(),
      error: () => this.reload(),
    });
  }

  /** Seam for tests — jsdom has no navigation. */
  protected reload(): void {
    window.location.reload();
  }

  open(): void {
    this.visible = true;
  }

  toggleDialog(): void {
    this.visible = !this.visible;
  }
}
