import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  SpriteInfo,
  SpriteModifier,
  ImageSource,
  OniItem,
  Overlay,
  ZIndex,
} from '../../lib';

// Structural contract with the game export: one representative building per
// render/overlay group. The database is *expected* to change on every import —
// these tests pin only the structural facts the renderer depends on (scene
// layer, object layer, overlay membership), so a fresh export that moves a
// representative between groups fails here before users see a rendering bug.
//
// Precedent: U59 moved the Heavi-Watt joint plates from the Building scene
// layer (19) to the wire-bridge layers (11/12), which made them render
// semi-transparent in the Buildings overlay. If a value pinned below changes,
// don't just update the number — check what the renderer derives from it
// (OniItem.isOverlayPrimary / ConnectionHelper.getOverlayFromLayer) and
// whether the game reordered an enum (see the LogicWires/LogicGates swap in
// lib/src/enums/z-index.ts).
describe('Game structure contract (representative buildings)', () => {
  interface Representative {
    id: string;
    sceneLayer: ZIndex;
    viewMode: Overlay;
    objectLayer: number;
    // Overlays in which this building renders fully opaque (primary or secondary);
    // it renders semi-transparent in every other overlay.
    solidIn: Overlay[];
  }

  const OBJECT_LAYER_BUILDING = OniItem.objectLayerBuilding;

  const representatives: Representative[] = [
    // Wires and bridges live on wire scene layers and are solid only in Power.
    { id: 'Wire', sceneLayer: ZIndex.Wires, viewMode: Overlay.Power, objectLayer: 26, solidIn: [Overlay.Power] },
    { id: 'WireBridge', sceneLayer: ZIndex.WireBridges, viewMode: Overlay.Power, objectLayer: 29, solidIn: [Overlay.Power] },
    // The Heavi-Watt joint plates render on wire-bridge scene layers (U59) but
    // occupy the Building object layer: physical tiles, solid in Buildings too.
    { id: 'WireBridgeHighWattage', sceneLayer: ZIndex.WireBridgesFront, viewMode: Overlay.Power, objectLayer: OBJECT_LAYER_BUILDING, solidIn: [Overlay.Base, Overlay.Power] },
    { id: 'WireRefinedBridgeHighWattage', sceneLayer: ZIndex.WireBridges, viewMode: Overlay.Power, objectLayer: OBJECT_LAYER_BUILDING, solidIn: [Overlay.Base, Overlay.Power] },
    // Conduits per fluid type.
    { id: 'LiquidConduit', sceneLayer: ZIndex.LiquidConduits, viewMode: Overlay.Liquid, objectLayer: 16, solidIn: [Overlay.Liquid] },
    { id: 'GasConduit', sceneLayer: ZIndex.GasConduits, viewMode: Overlay.Gas, objectLayer: 12, solidIn: [Overlay.Gas] },
    { id: 'SolidConduit', sceneLayer: ZIndex.SolidConduits, viewMode: Overlay.Conveyor, objectLayer: 20, solidIn: [Overlay.Conveyor] },
    // Automation: wires draw behind gates since U59 (LogicWires=13, LogicGates=14).
    { id: 'LogicWire', sceneLayer: ZIndex.LogicWires, viewMode: Overlay.Automation, objectLayer: 31, solidIn: [Overlay.Automation] },
    { id: 'LogicGateAND', sceneLayer: ZIndex.LogicGates, viewMode: Overlay.Automation, objectLayer: 30, solidIn: [Overlay.Automation] },
    // Plain buildings and tiles: Base overlay only, unless viewMode adds one.
    { id: 'Tile', sceneLayer: ZIndex.TileMain, viewMode: Overlay.Base, objectLayer: OBJECT_LAYER_BUILDING, solidIn: [Overlay.Base] },
    { id: 'Bed', sceneLayer: ZIndex.Building, viewMode: Overlay.Base, objectLayer: OBJECT_LAYER_BUILDING, solidIn: [Overlay.Base] },
    // A power consumer/producer building: solid in Base and highlighted in Power.
    { id: 'Generator', sceneLayer: ZIndex.Building, viewMode: Overlay.Power, objectLayer: OBJECT_LAYER_BUILDING, solidIn: [Overlay.Base, Overlay.Power] },
  ];

  // The overlays a blueprint camera can actually be in (getRealOverlay collapses
  // the decorative ones to Base before they reach the solidity check).
  const cameraOverlays = [
    Overlay.Base,
    Overlay.Power,
    Overlay.Liquid,
    Overlay.Gas,
    Overlay.Automation,
    Overlay.Conveyor,
  ];

  let database: any;
  let buildingsById: Map<string, any>;

  before(() => {
    const databaseJsonPath = path.join(__dirname, '../../assets/database/database-2024.json');
    database = JSON.parse(fs.readFileSync(databaseJsonPath, 'utf8'));
    buildingsById = new Map(database.buildings.map((b: any) => [b.prefabId, b]));

    // Same bootstrap as the backend (app/app.ts): OniItem.load needs the static
    // element/sprite registries populated.
    ImageSource.init();
    BuildableElement.init();
    BuildableElement.load(database.elements);
    BuildMenuCategory.init();
    BuildMenuCategory.load(database.buildMenuCategories);
    BuildMenuItem.init();
    BuildMenuItem.load(database.buildMenuItems);
    SpriteInfo.init();
    SpriteInfo.load(database.uiSprites);
    SpriteModifier.init();
    SpriteModifier.load(database.spriteModifiers);
    OniItem.init();
    OniItem.load(database.buildings);
  });

  describe('raw export facts', () => {
    for (const rep of representatives) {
      it(`${rep.id}: sceneLayer=${ZIndex[rep.sceneLayer]}, viewMode=${Overlay[rep.viewMode]}, objectLayer=${rep.objectLayer}`, () => {
        const record = buildingsById.get(rep.id);
        expect(record, `${rep.id} missing from database`).to.exist;
        expect(record.sceneLayer, 'sceneLayer').to.equal(rep.sceneLayer);
        expect(record.viewMode, 'viewMode').to.equal(rep.viewMode);
        expect(record.objectLayer, 'objectLayer').to.equal(rep.objectLayer);
      });
    }
  });

  describe('overlay solidity (isOverlayPrimary/isOverlaySecondary)', () => {
    for (const rep of representatives) {
      it(`${rep.id} is solid in [${rep.solidIn.map((o) => Overlay[o]).join(', ')}] only`, () => {
        const item = OniItem.getOniItem(rep.id);
        expect(item, `${rep.id} not loaded`).to.exist;

        const solidIn = cameraOverlays.filter(
          (overlay) => item.isOverlayPrimary(overlay) || item.isOverlaySecondary(overlay)
        );
        expect(solidIn).to.have.members(rep.solidIn);
      });
    }
  });
});
