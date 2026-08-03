import { Component } from "@angular/core";
import { ThemeService, ThemeOption } from "../../../services/theme.service";
import { AuthenticationService } from "../../../services/authentification-service";
import {
  ThemeId,
  ThemeColorToken,
  CustomThemeColors,
  isHexColor,
} from "../../../../../../../lib/index";

interface TokenControl {
  token: ThemeColorToken;
  label: string;
}

interface TokenGroup {
  label: string;
  tokens: TokenControl[];
}

/** Every editable slot, grouped the way the skin's own token comments group them. */
const TOKEN_GROUPS: TokenGroup[] = [
  {
    label: "Board & surfaces",
    tokens: [
      { token: "board", label: "Board (page ground)" },
      { token: "board-deep", label: "Board, deep void" },
      { token: "mount", label: "Card surface" },
      { token: "mount-hi", label: "Card, hovered" },
      { token: "inset", label: "Input fields" },
      { token: "rule", label: "Hairline" },
      { token: "rule-hi", label: "Hairline, strong" },
      { token: "chip", label: "Chip" },
      { token: "chip-hi", label: "Chip, hovered" },
      { token: "thumbbg", label: "Thumbnail ground" },
    ],
  },
  {
    label: "Tag",
    tokens: [
      { token: "tag", label: "Tag stock" },
      { token: "tag-hi", label: "Tag, hovered" },
      { token: "tag-ink", label: "Tag ink" },
      { token: "tag-ink-2", label: "Tag ink, secondary" },
    ],
  },
  {
    label: "Text",
    tokens: [
      { token: "ink", label: "Headings" },
      { token: "body", label: "Body text" },
      { token: "muted", label: "Secondary text" },
      { token: "faint", label: "Faint / counts" },
    ],
  },
  {
    label: "Accent",
    tokens: [
      { token: "mark", label: "Mark (interaction)" },
      { token: "mark-hi", label: "Mark, hovered" },
      { token: "mark-dim", label: "Mark, dim" },
      { token: "brass", label: "Brass (flagged)" },
      { token: "danger", label: "Danger" },
    ],
  },
];

@Component({
  selector: "app-dialog-theme",
  templateUrl: "./dialog-theme.component.html",
  styleUrls: ["./dialog-theme.component.css"],
  standalone: false,
})
export class DialogThemeComponent {
  visible = false;

  readonly tokenGroups = TOKEN_GROUPS;

  /** Whether the per-colour editor is expanded. */
  customOpen = false;

  /** Working colours while the editor is open; previewed live, saved explicitly. */
  draft: CustomThemeColors = {};

  /** True after Save until the next edit — drives the "Saved" affordance. */
  saved = false;

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

  get hasSavedCustom(): boolean {
    return this.themeService.customColors !== null;
  }

  /** The three-band swatch for the custom row: board, tag, mark. */
  get customSwatch(): [string, string, string] {
    const c = this.themeService.customColors ?? this.draft;
    return [c.board ?? "#1b1d21", c.tag ?? "#d6dde4", c.mark ?? "#1a9fff"];
  }

  // Applied on click, not on a Save button: the dialog sits over the page it is
  // restyling, so the preview and the commit are the same gesture.
  select(id: ThemeId): void {
    this.customOpen = false;
    this.themeService.select(id, this.loggedIn);
  }

  /**
   * The custom row. Re-selects the saved palette if one exists, and opens the
   * editor either way — a first-timer starts from the palette the page is
   * currently wearing.
   */
  selectCustom(): void {
    if (this.hasSavedCustom && !this.customOpen) {
      this.themeService.select("custom", this.loggedIn);
    }
    if (!this.customOpen) {
      this.draft = {
        ...this.themeService.seedColorsFromCurrent(),
        ...(this.themeService.customColors ?? {}),
      };
      this.customOpen = true;
      this.saved = false;
      this.themeService.previewCustom(this.draft);
    }
  }

  /** Template accessor: ngFor loop variables are untyped without strictTemplates. */
  draftValue(token: ThemeColorToken): string {
    return this.draft[token] ?? "";
  }

  /** Colour picker input — always a valid hex. */
  onPick(token: ThemeColorToken, value: string): void {
    this.setToken(token, value.toLowerCase());
  }

  /** Typed hex — applied only once it parses; the picker shows the last good value. */
  onHexTyped(token: ThemeColorToken, value: string): void {
    const v = value.trim().toLowerCase();
    if (isHexColor(v)) this.setToken(token, v);
  }

  private setToken(token: ThemeColorToken, hex: string): void {
    if (this.draft[token] === hex) return;
    this.draft = { ...this.draft, [token]: hex };
    this.saved = false;
    this.themeService.previewCustom(this.draft);
  }

  /** Throw the draft away and start again from the live palette. */
  resetDraft(): void {
    this.draft = this.themeService.seedColorsFromCurrent();
    this.saved = false;
    this.themeService.previewCustom(this.draft);
  }

  saveCustom(): void {
    if (this.themeService.saveCustom(this.draft, this.loggedIn)) {
      this.saved = true;
    }
  }

  get customDirty(): boolean {
    const committed = this.themeService.customColors;
    if (this.current !== "custom" || !committed) return true;
    return JSON.stringify(committed) !== JSON.stringify(this.draft);
  }

  open(): void {
    this.visible = true;
  }

  toggleDialog(): void {
    this.visible = !this.visible;
  }

  /** Closing the dialog abandons any unsaved preview. */
  onHide(): void {
    if (this.customOpen && this.customDirty) this.themeService.revertPreview();
    this.customOpen = false;
  }
}
