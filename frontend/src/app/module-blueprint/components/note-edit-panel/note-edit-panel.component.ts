import { Component } from "@angular/core";
import { BniWorldNote } from "../../../../../../lib/index";
import { WorldNoteService } from "../../services/world-note.service";

// Bottom-right editor for a selected BlueprintsV2 world note, modelled on the
// mod's in-game note edit screen: text notes edit name / text / icon colour;
// element notes edit mass / temperature (element type is read-only).
@Component({
  selector: "app-note-edit-panel",
  templateUrl: "./note-edit-panel.component.html",
  styleUrls: ["./note-edit-panel.component.css"],
  standalone: false,
})
export class NoteEditPanelComponent {
  // Icon-colour swatches (RRGGBB); tinthex is stored RRGGBBAA.
  readonly palette: string[] = [
    "ffffff",
    "c0c0c0",
    "808080",
    "404040",
    "000000",
    "7f5539",
    "b56576",
    "ff0000",
    "ff8000",
    "ffd000",
    "ffff00",
    "b0ff00",
    "00ff00",
    "00ff80",
    "00ffff",
    "00a0ff",
    "0000ff",
    "6a00ff",
    "b000ff",
    "ff00ff",
    "ff0080",
    "990000",
    "995200",
    "8a8a00",
    "3d8a00",
    "008a3d",
    "007e8a",
    "003d8a",
    "1a008a",
    "5c008a",
    "8a008a",
    "8a003d",
  ];

  constructor(public noteService: WorldNoteService) {}

  get note(): BniWorldNote | null {
    return this.noteService.selected;
  }

  get isText(): boolean {
    return this.note != null && this.note.type === 0;
  }

  get headerLabel(): string {
    return this.isText ? $localize`Text Note` : $localize`Element Note`;
  }

  // Icon colour (text notes). tinthex is RRGGBBAA — keep the alpha byte.
  isSelectedColor(hex: string): boolean {
    return (this.note?.tinthex ?? "").slice(0, 6).toLowerCase() === hex;
  }

  pickColor(hex: string) {
    if (this.note == null) return;
    const alpha = (this.note.tinthex ?? "ffffffff").slice(6, 8) || "FF";
    this.note.tinthex = hex + alpha;
    this.noteService.commit();
  }

  // Text fields mutate the note in place on every keystroke (ngModel) but
  // only commit — pushing an undo snapshot — on blur/Enter, matching the
  // slider-end rule for the same reason (spec §3, §12).
  commit() {
    this.noteService.commit();
  }

  deleteNote() {
    if (this.note != null) this.noteService.delete(this.note);
  }

  close() {
    this.noteService.clear();
  }
}
