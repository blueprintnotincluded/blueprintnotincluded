import { Vector2 } from '../vector2';
import { BlueprintItem } from './blueprint-item';
import { RocketStackPart, RocketStackWarning } from './blueprint-analyzer';
export declare function rocketHardpointCell(item: BlueprintItem): Vector2 | null;
export declare function attachesToRocket(item: BlueprintItem): boolean;
export declare function rocketAttachCell(item: BlueprintItem): Vector2;
export declare function positionForAttachCell(item: BlueprintItem, cell: Vector2): Vector2;
export declare function snapRocketModulePosition(item: BlueprintItem, cursor: Vector2, placedItems: BlueprintItem[]): Vector2 | null;
export declare function rocketStackParts(items: BlueprintItem[]): RocketStackPart[];
export declare function rocketStackWarnings(items: BlueprintItem[]): RocketStackWarning[];
//# sourceMappingURL=rocket-stack.d.ts.map