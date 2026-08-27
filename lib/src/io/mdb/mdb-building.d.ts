import { Vector2 } from '../../vector2';
import { UiSaveSettings } from '../../b-export/b-ui-screen';
import { InfoIcon } from '../../blueprint/note-conversion';
import { BniBuildingData } from '../bni/bni-building';
export interface MdbBuilding {
    id: string;
    temperature?: number;
    position?: Vector2;
    elements?: string[];
    settings?: UiSaveSettings[];
    buildingData?: BniBuildingData[];
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