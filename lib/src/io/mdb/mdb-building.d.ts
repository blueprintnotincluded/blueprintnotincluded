import { Vector2 } from '../../vector2';
import { UiSaveSettings } from '../../b-export/b-ui-screen';
import { InfoIcon } from '../../blueprint/blueprint-item-info';
export interface MdbBuilding {
    id: string;
    temperature?: number;
    position?: Vector2;
    elements?: string[];
    settings?: UiSaveSettings[];
    connections?: number;
    pipeElement?: string;
    orientation?: number;
    mass?: number;
    infoString?: string;
    title?: string;
    backColor?: number;
    frontColor?: number;
    icon?: InfoIcon;
}
//# sourceMappingURL=mdb-building.d.ts.map