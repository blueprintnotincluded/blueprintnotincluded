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
  @Input() active: boolean = false;
  @Input() disabled: boolean = false;
  @Output() buttonClick = new EventEmitter<void>();
}
