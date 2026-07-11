export declare const ROOM_TYPE_IDS: readonly ["latrine", "washroom", "barracks", "luxuryBarracks", "privateBedroom", "messHall", "greatHall", "banquetHall", "massageClinic", "hospital", "recreationRoom", "park", "natureReserve", "kitchen", "powerPlant", "greenhouse", "laboratory", "stable"];
export type RoomTypeId = (typeof ROOM_TYPE_IDS)[number];
export type RoomFamily = 'washroom' | 'sleep' | 'dining' | 'medical:massage' | 'medical:hospital' | 'recreation' | 'park' | 'kitchen' | 'power' | 'agriculture:greenhouse' | 'agriculture:stable' | 'science';
export type RoomConstraint = {
    kind: 'tag';
    tag: string;
    min?: number;
    max?: number;
} | {
    kind: 'prefabGroup';
    prefabs: readonly string[];
    min?: number;
    max?: number;
} | {
    kind: 'noNonLuxuryBed';
} | {
    kind: 'minCeilingHeight';
    height: number;
} | {
    kind: 'backwallComplete';
};
export interface RoomTypeDefinition {
    id: RoomTypeId;
    family: RoomFamily;
    tier: number;
    minSize: number;
    maxSize: number;
    requires: RoomConstraint[];
    overrides?: RoomTypeId[];
    upgradeUnverifiable?: boolean;
    caveats?: string;
}
export declare const ORNAMENT_PROXY_PREFABS: readonly ["ItemPedestal", "GravitasPedestal", "Shelf"];
export declare const ROOM_DEFINITIONS: readonly RoomTypeDefinition[];
export declare const MAX_ROOM_SIZE = 128;
export declare const MAX_DETECTION_AREA = 65536;
export declare const ROOM_BOUNDARY_DOORS: ReadonlySet<string>;
export declare const ROOM_TAGS_USED: readonly string[];
//# sourceMappingURL=room-definitions.d.ts.map