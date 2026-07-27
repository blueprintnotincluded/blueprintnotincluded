import { Component, OnInit, Output, EventEmitter, Input } from "@angular/core";
import { Subject } from "rxjs";
import { BuildableElement, ElementState } from "../../../../../../../lib/index";

@Component({
  selector: "app-cell-element-picker",
  templateUrl: "./cell-element-picker.component.html",
  styleUrls: ["./cell-element-picker.component.css"],
  standalone: false,
})
export class CellElementPickerComponent implements OnInit {
  filterNameSubject = new Subject<string>();
  filterName!: string;

  selectedTags: string[] = ["Gas", "Liquid"];
  elements!: BuildableElement[];

  @Output() selectElementCell = new EventEmitter<BuildableElement>();

  @Input() forceTag?: string;
  get isForcedTag() {
    return this.forceTag != undefined;
  }

  // Element-note-style filter: a fixed pool of states (e.g. [Solid, Liquid,
  // Gas]) drives a segmented All/<state>/<state>... filter instead of the
  // Gas/Liquid oreTags checkboxes. `None` is never selectable through this
  // path — a note about nothing is not a thing the mod can express.
  @Input() states?: ElementState[];
  get isStateFiltered() {
    return this.states != undefined;
  }
  selectedState: ElementState | null = null;

  constructor() {
    this.filterNameSubject.subscribe((_value: string) => {
      this.filter();
    });
  }

  ngOnInit() {
    this.filterElements();
  }

  filter() {
    this.filterElements();
  }

  tagChanged(_event: any) {
    this.filterElements();
  }

  selectState(state: ElementState | null) {
    this.selectedState = state;
    this.filterElements();
  }

  stateLabel(state: ElementState): string {
    switch (state) {
      case ElementState.Solid:
        return $localize`Solids`;
      case ElementState.Liquid:
        return $localize`Liquids`;
      case ElementState.Gas:
        return $localize`Gases`;
      default:
        return $localize`Vacuum`;
    }
  }

  filterElements() {
    this.elements = [];
    if (!this.isStateFiltered)
      this.elements.push(BuildableElement.getElement("None"));
    for (const element of BuildableElement.elements) {
      let filterString = false;
      let filterTag = false;
      let filterMissing = true;

      if (this.isStateFiltered) {
        const pool = this.states!;
        filterTag =
          pool.indexOf(element.state) != -1 &&
          (this.selectedState == null || element.state === this.selectedState);
      } else if (this.forceTag == undefined) {
        for (const tag of this.selectedTags)
          if (element.hasTag(tag)) filterTag = true;
      } else if (element.hasTag(this.forceTag)) filterTag = true;

      if (this.filterName == null || this.filterName == "") filterString = true;
      else if (
        element.name.toUpperCase().indexOf(this.filterName.toUpperCase()) != -1
      )
        filterString = true;

      if (element.name.indexOf("MISSING") != -1) filterMissing = false;

      if (filterString && filterTag && filterMissing)
        this.elements.push(element);
    }

    // The element-note pool is the whole periodic table's worth of materials,
    // so database order is unscannable there; the other callers (pipe/building
    // materials) list a handful and keep their existing order.
    if (this.isStateFiltered)
      this.elements.sort((a, b) => a.name.localeCompare(b.name));
  }

  selectElement(element: BuildableElement) {
    this.selectElementCell.emit(element);
  }
}
