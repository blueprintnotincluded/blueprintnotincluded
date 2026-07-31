import { BniWorldNote } from '../io/bni/bni-blueprint';
import { MdbBuilding } from '../io/mdb/mdb-building';
export declare enum InfoIcon {
    icon_inf = 0,
    icon_int = 1,
    icon_exc = 2,
    icon_no1 = 3,
    icon_no2 = 4,
    icon_no3 = 5,
    icon_no4 = 6,
    icon_no5 = 7,
    icon_no6 = 8,
    icon_no7 = 9,
    icon_no8 = 10,
    icon_no9 = 11
}
export declare const INFO_DEFAULT_BACK_COLOR = 31449;
export declare function infoBuildingToWorldNote(building: MdbBuilding): BniWorldNote;
//# sourceMappingURL=note-conversion.d.ts.map