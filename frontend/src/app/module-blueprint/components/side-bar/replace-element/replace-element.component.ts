import { Component, OnDestroy, OnInit } from "@angular/core";
import { MessageService } from "primeng/api";
import {
  BlueprintItem,
  BuildableElement,
  ReplaceElementPlan,
  ReplacementCandidate,
  elementsInSelection,
  replacementCandidates,
} from "../../../../../../../lib/index";
import { IObsSelectionChanged } from "src/app/module-blueprint/common/tools/select-tool";
import { ToolService } from "src/app/module-blueprint/services/tool-service";
import { ElementChangeInfo } from "../buildable-element-picker/buildable-element-picker.component";

// "Replace [X] with [Y] [Apply]" over the current selection - the material
// swap of #14. Both pickers are the ordinary buildable-element-picker: X
// offers the elements the selection is made of, Y the elements those slots
// can be switched to. The swap itself is SelectTool.replaceElement (one undo
// step); this component only chooses X and Y and reports the outcome.
@Component({
  selector: "app-replace-element",
  templateUrl: "./replace-element.component.html",
  styleUrls: ["./replace-element.component.css"],
  standalone: false,
})
export class ReplaceElementComponent
  implements OnInit, OnDestroy, IObsSelectionChanged
{
  // The picker mutates currentElement[0] on pick, so each side owns an array.
  fromElement: BuildableElement[] = [];
  toElement: BuildableElement[] = [];

  fromChoices: BuildableElement[][] = [[]];
  toChoices: BuildableElement[][] = [[]];
  private candidates: ReplacementCandidate[] = [];

  constructor(
    private toolService: ToolService,
    private messageService: MessageService,
  ) {}

  ngOnInit() {
    this.toolService.selectTool.subscribeSelectionChanged(this);
    this.selectionChanged();
  }

  ngOnDestroy() {
    const observers = this.toolService.selectTool.observersSelectionChanged;
    const index = observers.indexOf(this);
    if (index != -1) observers.splice(index, 1);
  }

  get show(): boolean {
    return this.fromChoices[0].length > 0;
  }

  get canApply(): boolean {
    return (
      this.fromElement[0] != null &&
      this.toElement[0] != null &&
      this.fromElement[0] != this.toElement[0]
    );
  }

  // Re-derive both pickers from the selection. X keeps its current value when
  // still present, else takes the element the selection was gathered by
  // (Element Report's "select every X"), else the first element found.
  selectionChanged() {
    const selectTool = this.toolService.selectTool;
    const items = selectTool.selectedItems;
    const found = elementsInSelection(items);
    this.fromChoices = [found];

    const previous = this.fromElement[0];
    const seed = selectTool.selectionElement;
    let from: BuildableElement | undefined;
    if (previous != null && found.indexOf(previous) != -1) from = previous;
    else if (seed != null && found.indexOf(seed) != -1) from = seed;
    else from = found[0];

    this.fromElement = from == null ? [] : [from];
    this.refreshCandidates(items);
  }

  private refreshCandidates(items: BlueprintItem[]) {
    const from = this.fromElement[0];
    this.candidates = from == null ? [] : replacementCandidates(items, from);
    const elements = this.candidates.map((candidate) => candidate.element);
    this.toChoices = [elements];

    const previous = this.toElement[0];
    const to =
      previous != null && elements.indexOf(previous) != -1
        ? previous
        : elements[0];
    this.toElement = to == null ? [] : [to];
  }

  changeFrom(change: ElementChangeInfo) {
    this.fromElement = [change.newElement];
    this.refreshCandidates(this.toolService.selectTool.selectedItems);
  }

  changeTo(change: ElementChangeInfo) {
    this.toElement = [change.newElement];
  }

  tooltipForCandidate = (element: BuildableElement): string => {
    const candidate = this.candidates.find((c) => c.element == element);
    if (candidate == null || candidate.skipped == 0) return element.name;
    return $localize`${element.name}:elementName: (${candidate.skipped}:count: selected building${
      candidate.skipped > 1 ? "s" : ""
    } cannot be made of it)`;
  };

  apply() {
    if (!this.canApply) return;
    const plan = this.toolService.selectTool.replaceElement(
      this.fromElement[0],
      this.toElement[0],
    );
    this.messageService.add({
      severity: plan.changes.length > 0 ? "success" : "warn",
      summary: $localize`Replace ${plan.from.name}:from: with ${plan.to.name}:to:`,
      detail: ReplaceElementComponent.describe(plan),
    });
  }

  // "Replaced Cobalt with Copper on 41 buildings (3 skipped: Plastic Ladder
  // cannot be made of Copper)". A multi-slot building whose other X slot
  // could not take Y counts as changed but is called out as partial.
  static describe(plan: ReplaceElementPlan): string {
    const changed = plan.changes.length;
    let text = $localize`Replaced ${plan.from.name}:from: with ${plan.to.name}:to: on ${changed}:count: building${
      changed == 1 ? "" : "s"
    }`;
    const partial = plan.changes.filter((change) => change.blocked.length > 0);
    if (partial.length > 0) {
      const names = ReplaceElementComponent.typeNames(
        partial.map((change) => change.item),
      );
      text += $localize` (${partial.length}:count: only partly: ${names}:buildings: cannot be made of ${plan.to.name}:to: in every slot)`;
    }
    if (plan.skipped.length > 0) {
      const names = ReplaceElementComponent.typeNames(plan.skipped);
      text += $localize` (${plan.skipped.length}:count: skipped: ${names}:buildings: cannot be made of ${plan.to.name}:to:)`;
    }
    return text;
  }

  private static typeNames(items: BlueprintItem[]): string {
    const names: string[] = [];
    for (const item of items)
      if (names.indexOf(item.oniItem.name) == -1) names.push(item.oniItem.name);
    return names.join(", ");
  }
}
