import { Component, EventEmitter, Input, Output } from "@angular/core";
import {
  BniWorldNote,
  BuildableElement,
  DrawHelpers,
  ElementState,
  stripNoteMarkup,
} from "../../../../../../../lib/index";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Element and mass/temperature controls for a BniWorldNote (type 1), shared
// by the bottom-right note-edit-panel (selected note) and, from phase 4, the
// notes-tool side panel (pending note) — so it never touches WorldNoteService
// directly. The caller owns persistence: it mutates `note` in place via
// two-way bindings and commits (WorldNoteService.commit() or equivalent) only
// when `noteChange` fires, matching the slider-end/blur commit rule used
// everywhere else in the notes feature (spec/element-notes.md §3, §8).
@Component({
  selector: "app-element-note-editor",
  templateUrl: "./element-note-editor.component.html",
  styleUrls: ["./element-note-editor.component.css"],
  standalone: false,
})
export class ElementNoteEditorComponent {
  @Input() note!: BniWorldNote;
  @Output() noteChange = new EventEmitter<void>();

  readonly pickerStates: ElementState[] = [
    ElementState.Solid,
    ElementState.Liquid,
    ElementState.Gas,
  ];

  readonly temperatureThresholds = DrawHelpers.temperatureThresholds;

  get element(): BuildableElement | undefined {
    return this.note?.id != null
      ? BuildableElement.getElementByTag(this.note.id)
      : undefined;
  }

  // Whether the note names an element *at all*. Deliberately not "did the id
  // resolve": an element note carrying a modded/unknown tag still has stored
  // mass and temperature worth showing and editing, so only a note with no id
  // yet (a fresh pending note) collapses to the pick-an-element prompt.
  get hasElement(): boolean {
    return this.note?.id != null;
  }

  get elementName(): string {
    const element = this.element;
    return element != null
      ? stripNoteMarkup(element.name)
      : $localize`Unknown element`;
  }

  get elementStateLabel(): string {
    const element = this.element;
    if (element == null) return "";
    switch (element.state) {
      case ElementState.Solid:
        return $localize`Solid`;
      case ElementState.Liquid:
        return $localize`Liquid`;
      case ElementState.Gas:
        return $localize`Gas`;
      default:
        return $localize`Vacuum`;
    }
  }

  get markerName(): "solid" | "liquid" | "gas" | null {
    const element = this.element;
    if (element == null) return null;
    switch (element.state) {
      case ElementState.Solid:
        return "solid";
      case ElementState.Liquid:
        return "liquid";
      case ElementState.Gas:
        return "gas";
      default:
        return null;
    }
  }

  get markerUrl(): string {
    return "assets/images/notes/" + (this.markerName ?? "note") + ".png";
  }

  get markerTint(): string {
    const element = this.element;
    return element != null
      ? DrawHelpers.colorToHex(element.uiColor)
      : "#3b82f6";
  }

  // Selecting a new element always re-seeds mass and temperature from that
  // element's own defaults (spec §8.2, plan Q3 — resolved: always re-seed).
  // Carrying over the previous element's values could easily land outside
  // the new element's valid mass/temperature range.
  onSelectElement(element: BuildableElement) {
    if (this.note == null) return;
    this.note.id = element.tag;
    this.note.mass = element.defaultMass;
    this.note.temp = element.defaultTemperature;
    this.noteChange.emit();
  }

  // Mass (kg)
  get maxMass(): number {
    return this.element?.maxMass ?? 0;
  }
  get hasMassRange(): boolean {
    return this.maxMass > 0;
  }
  // A step derived from the element's own range rather than one constant for
  // every element: gases (maxMass ~1.8) land on ~0.001 kg steps, solids
  // (maxMass ~1840) on ~1 kg steps (spec §8.2).
  get massStep(): number {
    const max = this.maxMass;
    if (max <= 0) return 1;
    const raw = max / 1000;
    const decimals = clamp(-Math.floor(Math.log10(raw)), 0, 3);
    const factor = Math.pow(10, decimals);
    return Math.round(raw * factor) / factor;
  }
  get massKg(): number {
    return this.note?.mass ?? 0;
  }
  set massKg(value: number) {
    if (this.note != null) this.note.mass = value;
  }
  clampMass(value: number): number {
    return this.hasMassRange
      ? clamp(value, 0, this.maxMass)
      : Math.max(0, value);
  }
  commitMass() {
    if (this.note == null) return;
    this.note.mass = this.clampMass(this.note.mass ?? 0);
    this.noteChange.emit();
  }

  // Temperature (stored Kelvin, edited in °C on a piecewise 0-100 scale so
  // gases with highTemp in the thousands stay usable — spec §8.3).
  get lowTemp(): number {
    return this.element?.lowTemp ?? 0;
  }
  get highTemp(): number {
    return this.element?.highTemp ?? 0;
  }
  get hasTempRange(): boolean {
    return this.highTemp > 0;
  }
  get tempKelvin(): number {
    return this.note?.temp ?? 0;
  }
  get tempCelsius(): number {
    return Math.round((this.tempKelvin - 273.15) * 10) / 10;
  }
  set tempCelsius(value: number) {
    if (this.note != null) this.note.temp = value + 273.15;
  }
  get tempScale(): number {
    return DrawHelpers.temperatureToScale(this.tempKelvin);
  }
  set tempScale(value: number) {
    if (this.note != null)
      this.note.temp = DrawHelpers.scaleToTemperature(value);
  }
  clampTemp(kelvin: number): number {
    return this.hasTempRange
      ? clamp(kelvin, this.lowTemp, this.highTemp)
      : kelvin;
  }
  commitTemp() {
    if (this.note == null) return;
    this.note.temp = this.clampTemp(this.note.temp ?? 0);
    this.noteChange.emit();
  }
  // Reachable band on the 0-100 gradient, for the highlight overlay.
  get bandStartPercent(): number {
    return this.hasTempRange ? DrawHelpers.temperatureToScale(this.lowTemp) : 0;
  }
  get bandEndPercent(): number {
    return this.hasTempRange
      ? DrawHelpers.temperatureToScale(this.highTemp)
      : 100;
  }

  temperatureOffset(index: number): number {
    return (
      DrawHelpers.temperatureToScale(
        this.temperatureThresholds[index].temperature,
      ) / 100
    );
  }
  temperatureColor(index: number): string {
    return DrawHelpers.colorToHex(this.temperatureThresholds[index].color);
  }
}
