import { Vector2 } from './vector2';
import { ConnectionType } from './enums/connection-type';
import { Overlay } from './enums/overlay';
import { ZIndex } from './enums/z-index';
import { BlueprintItem } from './blueprint/blueprint-item';
export interface UtilityConnection {
    type: ConnectionType;
    offset: Vector2;
    isSecondary: boolean;
}
export interface UtilityConnectionTracker {
    utilityConnection: UtilityConnection;
    blueprintItem: BlueprintItem;
}
export declare class ConnectionSprite {
    spriteInfoId: string;
    color: number;
}
export declare class ConnectionHelper {
    static getConnectionOverlay(connectionType: ConnectionType): Overlay;
    static getConnectionName(connectionType: ConnectionType): string;
    static getConnectionSprite(connectionType: UtilityConnection): ConnectionSprite;
    static getOverlayFromLayer(sceneLayer: ZIndex): Overlay;
}
//# sourceMappingURL=utility-connection.d.ts.map