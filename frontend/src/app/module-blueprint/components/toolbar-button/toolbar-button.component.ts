import { Component, Input, Output, EventEmitter } from "@angular/core";

@Component({
  selector: "app-toolbar-button",
  templateUrl: "./toolbar-button.component.html",
  styleUrls: ["./toolbar-button.component.css"],
  standalone: false,
})
export class ToolbarButtonComponent {
  @Input() iconUrl!: string;
  @Input() label!: string;
  // The tool's key, shown after the label in the tooltip ("Select (V)").
  // Empty for a tool with no key bound.
  @Input() hint: string = "";
  @Input() active: boolean = false;
  @Input() disabled: boolean = false;
  @Output() buttonClick = new EventEmitter<void>();

  get tooltip(): string {
    return this.hint ? `${this.label} (${this.hint})` : this.label;
  }
}
