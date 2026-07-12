import { Component, ViewChild, ElementRef, Renderer2 } from "@angular/core";
import { ToolService } from "../../../services/tool-service";
import { Accordion } from "primeng/accordion";

@Component({
  selector: "app-selection-tool",
  templateUrl: "./selection-tool.component.html",
  styleUrls: ["./selection-tool.component.css"],
  standalone: false,
})
export class ComponentSideSelectionToolComponent {
  @ViewChild("buildingsAccordion", { static: true })
  buildingsAccordion!: Accordion;
  @ViewChild("selectToolCard", { static: true }) selectToolCard!: ElementRef;

  constructor(
    public toolService: ToolService,
    private renderer: Renderer2,
  ) {}

  setMaxHeight(position: number) {
    this.renderer.setStyle(
      this.selectToolCard.nativeElement,
      "max-height",
      "calc(100vh - " + position + "px - 20px)",
    );
  }

  get activePanels(): number[] {
    return this.toolService.selectTool.sameItemCollections
      .map((c, i) => (c.selected ? i : -1))
      .filter((i) => i >= 0);
  }

  onPanelChange(values: any): void {
    const vals = Array.isArray(values) ? values : [values];
    this.toolService.selectTool.sameItemCollections.forEach((c, i) => {
      c.selected = vals.includes(i);
    });
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
