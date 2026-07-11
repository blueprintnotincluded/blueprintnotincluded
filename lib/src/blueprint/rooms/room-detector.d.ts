import { Blueprint } from '../blueprint';
import { RoomTypeId } from './room-definitions';
export interface RoomDetectorOptions {
    maxDetectionArea?: number;
    maxRoomSize?: number;
}
export interface DetectedRoom {
    type: RoomTypeId;
    possibleUpgrade?: RoomTypeId;
    cavityId: number;
    cells: number[];
    size: number;
}
export interface Cavity {
    id: number;
    cells: number[];
    size: number;
    result: 'room' | 'miscellaneous' | 'conflict' | 'too-large-for-room';
    matchedTypes: RoomTypeId[];
}
export interface RoomDetectionResult {
    status: 'ok' | 'too-large' | 'empty';
    rooms: DetectedRoom[];
    cavities: Cavity[];
}
export declare function detectRooms(blueprint: Blueprint, options?: RoomDetectorOptions): RoomDetectionResult;
export declare function roomSearchTags(result: RoomDetectionResult): RoomTypeId[];
//# sourceMappingURL=room-detector.d.ts.map