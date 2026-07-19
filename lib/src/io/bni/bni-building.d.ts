import { Vector2 } from '../../vector2';
import { Orientation } from '../../enums/orientation';
export interface BniBuildingData {
    Key: string;
    Value: any;
}
export declare class BniBuilding {
    offset: Vector2;
    buildingdef: string;
    orientation: Orientation;
    flags: number;
    selected_elements: number[];
    buildingData?: BniBuildingData[];
}
//# sourceMappingURL=bni-building.d.ts.map