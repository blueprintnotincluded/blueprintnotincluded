import { Component } from "@angular/core";
import { BniWorldNote } from "../../../../../../lib/index";
import { WorldNoteService } from "../../services/world-note.service";
import { ToolService } from "../../services/tool-service";
import { NotesTool } from "../../common/tools/notes-tool";
import { ToolType } from "../../common/tools/tool";
import { NOTE_TINT_PALETTE } from "./note-tint-palette";
import { NOTE_SYMBOLS, noteSymbolUrl, resolveNoteSymbol } from "./note-symbols";

// The one editor for BlueprintsV2 world notes, pinned bottom-right the way the
// mod's in-game note screen is. It shows whichever note is in play:
//
//   - a *placed* note the user selected (from any tool) — full edit: name /
//     text / icon colour for text notes, element + mass / temperature for
//     element notes, plus Delete;
//   - otherwise, while the Note Creation Tool is active, the *pending* note
//     the next click will place — mode tabs and the same controls, minus the
//     fields a note that doesn't exist yet can't have (spec §6).
//
// There is deliberately no second copy of these controls in the left tool
// panel: placing a note selects it, so this panel is what the user is already
// looking at both before and after the click.
@Component({
  selector: "app-note-edit-panel",
  templateUrl: "./note-edit-panel.component.html",
  styleUrls: ["./note-edit-panel.component.css"],
  standalone: false,
})
export class NoteEditPanelComponent {
  // tinthex is stored RRGGBBAA.
  readonly palette: string[] = NOTE_TINT_PALETTE;

  constructor(
    public noteService: WorldNoteService,
    private toolService: ToolService,
    private notesTool: NotesTool,
  ) {}

  // No note selected: the panel is showing the creation template.
  get isDraft(): boolean {
    return this.noteService.selected == null;
  }

  get note(): BniWorldNote | null {
    const selected = this.noteService.selected;
    if (selected != null) return selected;
    return this.notesTool.visible ? this.notesTool.pendingNote : null;
  }

  get mode(): "text" | "element" {
    return this.notesTool.mode;
  }
  set mode(value: "text" | "element") {
    this.notesTool.mode = value;
  }

  get isText(): boolean {
    return this.note != null && this.note.type === 0;
  }

  get headerLabel(): string {
    if (this.isDraft) return $localize`Note Creation Tool`;
    return this.isText ? $localize`Text Note` : $localize`Element Note`;
  }

  // Icon (text notes). The stored value is the mod's sprite name; an empty or
  // unrecognised one renders the default note sprite, which is the same art as
  // note_info, so that is the swatch shown as selected.
  readonly symbols: string[] = NOTE_SYMBOLS;

  symbolUrl(symbol: string): string {
    return noteSymbolUrl(symbol);
  }

  isSelectedSymbol(symbol: string): boolean {
    return symbol === resolveNoteSymbol(this.note?.symbol);
  }

  pickSymbol(symbol: string) {
    if (this.note == null) return;
    this.note.symbol = symbol;
    this.commit();
  }

  // Icon colour (text notes). tinthex is RRGGBBAA — keep the alpha byte.
  isSelectedColor(hex: string): boolean {
    return (this.note?.tinthex ?? "").slice(0, 6).toLowerCase() === hex;
  }

  pickColor(hex: string) {
    if (this.note == null) return;
    const alpha = (this.note.tinthex ?? "ffffffff").slice(6, 8) || "ff";
    this.note.tinthex = hex + alpha;
    this.commit();
  }

  // Text fields mutate the note in place on every keystroke (ngModel) but
  // only commit — pushing an undo snapshot — on blur/Enter, matching the
  // slider-end rule for the same reason (spec §3, §12).
  //
  // The pending note is not in the blueprint, so editing it must not reassign
  // worldNotes or push an undo entry: a draft edit commits nothing.
  commit() {
    if (this.isDraft) return;
    this.noteService.commit();
  }

  deleteNote() {
    const note = this.noteService.selected;
    if (note != null) this.noteService.delete(note);
  }

  // Closing a placed note falls back to the creation template while the tool
  // is still active, so the panel stays where the user is working; closing the
  // template itself means they are done placing notes.
  close() {
    if (this.isDraft) this.toolService.changeTool(ToolType.select);
    else this.noteService.clear();
  }
}
