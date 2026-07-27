import { Component } from "@angular/core";
import { NotesTool } from "../../../common/tools/notes-tool";
import { NOTE_TINT_PALETTE } from "../../note-edit-panel/note-tint-palette";

// Side-bar panel for the Note Creation Tool (spec/element-notes.md §6-§7):
// mode tabs, then the editor for the *pending* note that will be placed on
// the next click. The element-mode editor is the same component the
// bottom-right panel reuses for a *placed* note's element fields.
@Component({
  selector: "app-notes-tool",
  templateUrl: "./notes-tool.component.html",
  styleUrls: ["./notes-tool.component.css"],
  standalone: false,
})
export class NotesToolComponent {
  readonly palette: string[] = NOTE_TINT_PALETTE;

  constructor(public tool: NotesTool) {}

  isSelectedColor(hex: string): boolean {
    return this.tool.pendingTint.slice(0, 6).toLowerCase() === hex;
  }

  pickColor(hex: string) {
    const alpha = this.tool.pendingTint.slice(6, 8) || "ff";
    this.tool.pendingTint = hex + alpha;
  }
}
