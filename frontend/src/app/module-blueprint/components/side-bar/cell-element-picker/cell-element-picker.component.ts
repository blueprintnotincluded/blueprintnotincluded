import { Component, OnInit, Output, EventEmitter, Input } from "@angular/core";
import { Subject } from "rxjs";
import { BuildableElement } from "../../../../../../../lib/index";

@Component({
  selector: "app-cell-element-picker",
  templateUrl: "./cell-element-picker.component.html",
  styleUrls: ["./cell-element-picker.component.css"],
  
})
export class CellElementPickerComponent implements OnInit {
  filterNameSubject = new Subject<string>();
  filterName: string;

  selectedTags: string[] = ["Gas", "Liquid"];
  elements: BuildableElement[];

  @Output() selectElementCell = new EventEmitter<BuildableElement>();

  @Input() forceTag: string;
  get isForcedTag() {
    return this.forceTag != undefined;
  }

  constructor() {
    this.filterNameSubject.subscribe((value) => {
      this.filter();
    });
  }

  ngOnInit() {
    this.filterElements();
  }

  filter() {
    this.filterElements();
  }

  tagChanged(event: any) {
    this.filterElements();
  }

  filterElements() {
    this.elements = [];
    this.elements.push(BuildableElement.getElement("None"));
    for (let element of BuildableElement.elements) {
      let addToList = false;

      let filterString = false;
      let filterTag = false;
      let filterMissing = true;

      if (this.forceTag == undefined) {
        for (let tag of this.selectedTags)
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
  }

  selectElement(element: BuildableElement) {
    this.selectElementCell.emit(element);
  }
}
