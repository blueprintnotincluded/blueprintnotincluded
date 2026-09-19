import { BlueprintItem } from './blueprint-item';
import { BuildableElement } from '../b-export/b-element';
export interface ElementReplacement {
    item: BlueprintItem;
    slots: number[];
    blocked: number[];
}
export interface ReplaceElementPlan {
    from: BuildableElement;
    to: BuildableElement;
    changes: ElementReplacement[];
    skipped: BlueprintItem[];
}
export interface ReplacementCandidate {
    element: BuildableElement;
    skipped: number;
}
export declare function elementsInSelection(items: BlueprintItem[]): BuildableElement[];
export declare function replacementCandidates(items: BlueprintItem[], from: BuildableElement): ReplacementCandidate[];
export declare function planElementReplacement(items: BlueprintItem[], from: BuildableElement, to: BuildableElement): ReplaceElementPlan;
export declare function applyElementReplacement(plan: ReplaceElementPlan): ReplaceElementPlan;
//# sourceMappingURL=replace-element.d.ts.map