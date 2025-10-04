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

export class ConnectionSprite {
  spriteInfoId: string = '';
  color: number = 0;
}

export class ConnectionHelper {
  public static getConnectionOverlay(connectionType: ConnectionType): Overlay {
    switch (connectionType) {
      case ConnectionType.POWER_OUTPUT:
      case ConnectionType.POWER_INPUT:
        return Overlay.Power;
      case ConnectionType.GAS_INPUT:
      case ConnectionType.GAS_OUTPUT:
        return Overlay.Gas;
      case ConnectionType.LIQUID_INPUT:
      case ConnectionType.LIQUID_OUTPUT:
        return Overlay.Liquid;
      case ConnectionType.LOGIC_INPUT:
      case ConnectionType.LOGIC_OUTPUT:
      case ConnectionType.LOGIC_RIBBON_INPUT:
      case ConnectionType.LOGIC_RIBBON_OUTPUT:
      case ConnectionType.LOGIC_RESET_UPDATE:
      case ConnectionType.LOGIC_CONTROL_INPUT:
        return Overlay.Automation;
      case ConnectionType.SOLID_INPUT:
      case ConnectionType.SOLID_OUTPUT:
        return Overlay.Conveyor;
      default:
        return Overlay.Unknown;
    }
  }

  public static getConnectionName(connectionType: ConnectionType): string {
    switch (connectionType) {
      case ConnectionType.POWER_OUTPUT:
        return 'Power Output';
      case ConnectionType.POWER_INPUT:
        return 'Power Input';
      case ConnectionType.GAS_INPUT:
        return 'Gas Input';
      case ConnectionType.GAS_OUTPUT:
        return 'Gas Output';
      case ConnectionType.LIQUID_INPUT:
        return 'Liquid Input';
      case ConnectionType.LIQUID_OUTPUT:
        return 'Liquid Output';
      case ConnectionType.LOGIC_INPUT:
        return 'Logic Input';
      case ConnectionType.LOGIC_OUTPUT:
        return 'Logic Output';
      case ConnectionType.LOGIC_RIBBON_INPUT:
        return 'Logic Ribbon Input';
      case ConnectionType.LOGIC_RIBBON_OUTPUT:
        return 'Logic Ribbon Output';
      case ConnectionType.LOGIC_RESET_UPDATE:
        return 'Logic Reset Input';
      case ConnectionType.LOGIC_CONTROL_INPUT:
        return 'Logic Control Input';
      case ConnectionType.SOLID_INPUT:
        return 'Conveyor Input';
      case ConnectionType.SOLID_OUTPUT:
        return 'Conveyor Output';
      default:
        return 'Unknown';
    }
  }

  public static getConnectionSprite(connectionType: UtilityConnection): ConnectionSprite {
    // TODO isInput as boolean
    // Green  : 6BD384
    // Orange : FBB03B

    let connectionSprite: ConnectionSprite;

    connectionSprite = { color: 0xffffff, spriteInfoId: 'electrical_disconnected' };
    if (connectionType.type == ConnectionType.POWER_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'electrical_disconnected' };
    if (connectionType.type == ConnectionType.POWER_OUTPUT)
      connectionSprite = { color: 0x6bd384, spriteInfoId: 'electrical_disconnected' };
    if (connectionType.type == ConnectionType.GAS_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'input' };
    if (connectionType.type == ConnectionType.GAS_OUTPUT)
      connectionSprite = { color: 0x6bd384, spriteInfoId: 'output' };
    if (connectionType.type == ConnectionType.LIQUID_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'input' };
    if (connectionType.type == ConnectionType.LIQUID_OUTPUT)
      connectionSprite = { color: 0x6bd384, spriteInfoId: 'output' };
    if (connectionType.type == ConnectionType.LOGIC_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'logicInput' };
    if (connectionType.type == ConnectionType.LOGIC_OUTPUT)
      connectionSprite = { color: 0x6bd384, spriteInfoId: 'logicOutput' };
    if (connectionType.type == ConnectionType.SOLID_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'input' };
    if (connectionType.type == ConnectionType.SOLID_OUTPUT)
      connectionSprite = { color: 0x6bd384, spriteInfoId: 'output' };
    if (connectionType.type == ConnectionType.LOGIC_RESET_UPDATE)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'logicResetUpdate' };
    if (connectionType.type == ConnectionType.LOGIC_CONTROL_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'logicResetUpdate' };
    if (connectionType.type == ConnectionType.LOGIC_RIBBON_INPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'logic_ribbon_all_in' };
    if (connectionType.type == ConnectionType.LOGIC_RIBBON_OUTPUT)
      connectionSprite = { color: 0xffffff, spriteInfoId: 'logic_ribbon_all_out' };

    if (connectionType.isSecondary) connectionSprite.color = 0xfbb03b;

    return connectionSprite;
  }

  // TODO should not be here
  public static getOverlayFromLayer(sceneLayer: ZIndex): Overlay {
    switch (sceneLayer) {
      case ZIndex.NoLayer:
      case ZIndex.Background:
      case ZIndex.Backwall:
        return Overlay.Unknown;
      case ZIndex.Gas:
        return Overlay.Gas;
      case ZIndex.GasConduits:
      case ZIndex.GasConduitBridges:
        return Overlay.Gas;
      case ZIndex.LiquidConduits:
      case ZIndex.LiquidConduitBridges:
        return Overlay.Liquid;
      case ZIndex.SolidConduits:
      case ZIndex.SolidConduitContents:
      case ZIndex.SolidConduitBridges:
        return Overlay.Conveyor;
      case ZIndex.Wires:
      case ZIndex.WireBridges:
      case ZIndex.WireBridgesFront:
        return Overlay.Power;
      case ZIndex.LogicWires:
      case ZIndex.LogicGates:
      case ZIndex.LogicGatesFront:
        return Overlay.Automation;
      case ZIndex.InteriorWall:
      case ZIndex.InteriorWall:
      case ZIndex.GasFront:
      case ZIndex.BuildingBack:
      case ZIndex.Building:
      case ZIndex.BuildingUse:
      case ZIndex.BuildingFront:
      case ZIndex.TransferArm:
      case ZIndex.Ore:
      case ZIndex.Creatures:
      case ZIndex.Move:
      case ZIndex.Front:
      case ZIndex.GlassTile:
      case ZIndex.Liquid:
      case ZIndex.Ground:
      case ZIndex.TileMain:
      case ZIndex.TileFront:
      case ZIndex.FXFront:
      case ZIndex.FXFront2:
      case ZIndex.SceneMAX:
        return Overlay.Base;
      default:
        return Overlay.Base;
    }
  }
}
