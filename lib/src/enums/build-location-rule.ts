export enum BuildLocationRule {
  Anywhere,
  OnFloor,
  OnFloorOverSpace,
  OnCeiling,
  OnWall,
  InCorner,
  Tile,
  NotInTiles,
  Conduit,
  LogicBridge,
  WireBridge,
  HighWattBridgeTile,
  BuildingAttachPoint,
  OnFloorOrBuildingAttachPoint,
  OnFoundationRotatable,
  BelowRocketCeiling,
  OnRocketEnvelope,
  WallFloor,
  // Liquid bridge that forbids a conduit on its origin cell (conductive pipe bridge)
  NoLiquidConduitAtOrigin,
  // U59 rule for the underwater ranch stations + shelf; Klei's official member
  // name is unverified (no public decompile of this game version yet)
  Underwater,
}
