import {
  Component,
  OnInit,
  ChangeDetectorRef,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  Renderer2,
  OnChanges,
  AfterViewChecked,
  AfterViewInit,
} from "@angular/core";
import { BlueprintService } from "../../../services/blueprint-service";
import { ToolService } from "../../../services/tool-service";
import { Accordion } from "primeng/accordion";

@Component({
  selector: "app-selection-tool",
  templateUrl: "./selection-tool.component.html",
  styleUrls: ["./selection-tool.component.css"],
  
})
export class ComponentSideSelectionToolComponent {
  @ViewChild("buildingsAccordion", { static: true })
  buildingsAccordion: Accordion;
  @ViewChild("selectToolCard", { static: true }) selectToolCard: ElementRef;

  constructor(public toolService: ToolService, private renderer: Renderer2) {}

  setMaxHeight(position: number) {
    this.renderer.setStyle(
      this.selectToolCard.nativeElement,
      "max-height",
      "calc(100vh - " + position + "px - 20px)"
    );
  }

  itemGroupeNext() {
    this.toolService.selectTool.itemGroupeNext();
  }

  itemGroupePrevious() {
    this.toolService.selectTool.itemGroupePrevious();
  }

  destroyAll() {
    this.toolService.selectTool.destroyAll();
  }
}
