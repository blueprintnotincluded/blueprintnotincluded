import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  BlueprintItem,
  BuildableElement,
  BuildLocationRule,
  BuildMenuCategory,
  BuildMenuItem,
  CameraService,
  ConnectionType,
  SpriteInfo,
  SpriteModifier,
  ImageSource,
  OniItem,
  Overlay,
  ZIndex,
} from '../../lib';

const elementIds = (item: OniItem, slot: number) =>
  item.buildableElementsArray[slot].map((e) => e.id);

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

  // Construction materials. U59 introduced '&'-joined union categories
  // ("Plumbable&Metal") and niche categories whose elements lack the
  // BuildableAny wildcard tag (BuildingWood, Rubber, Snow, Fossil). When
  // material resolution breaks, OniItem.cleanUp falls back to a Vacuum-only
  // slot — which is exactly what these tests exist to catch.
  describe('buildable materials', () => {
    it('LiquidConduit (Plumbable&Metal union) offers both plumbable rocks and metal ores', () => {
      const ids = elementIds(OniItem.getOniItem('LiquidConduit'), 0);
      expect(ids).to.include('SandStone'); // Plumbable
      expect(ids).to.include('IronOre'); // Metal
      expect(ids).to.not.include('Vacuum');
    });

    it('GasConduit (BuildableRaw&Metal union) offers both raw minerals and metal ores', () => {
      const ids = elementIds(OniItem.getOniItem('GasConduit'), 0);
      expect(ids).to.include('SandStone'); // BuildableRaw
      expect(ids).to.include('IronOre'); // Metal
      expect(ids).to.not.include('Vacuum');
    });

    it('WoodenDoor offers wood even though WoodLog lacks the BuildableAny tag', () => {
      expect(elementIds(OniItem.getOniItem('WoodenDoor'), 0)).to.include('WoodLog');
    });

    it('Wire (Metal) offers solid ores but never molten or gaseous metal phases', () => {
      const ids = elementIds(OniItem.getOniItem('Wire'), 0);
      expect(ids).to.include('IronOre');
      expect(ids).to.not.include('MoltenIron');
      expect(ids).to.not.include('IronGas');
    });

    it('no building with a material category falls back to the Vacuum-only slot', () => {
      const broken: string[] = [];
      for (const record of database.buildings) {
        const categories: string[] = record.materialCategory.filter(
          (c: string) => c !== 'BuildingFiber'
        );
        if (categories.length === 0) continue;

        const item = OniItem.getOniItem(record.prefabId);
        const vacuumFallback =
          item.buildableElementsArray.length === 1 &&
          item.buildableElementsArray[0].length === 1 &&
          item.buildableElementsArray[0][0].id === 'Vacuum';
        if (vacuumFallback) broken.push(`${record.prefabId} (${categories.join(', ')})`);
      }
      expect(broken, `buildings with no selectable materials: ${broken.join('; ')}`).to.be.empty;
    });
  });

  // Every enum-valued field in the export must map to a defined member of the
  // website's mirror enum. This is the broad detector: when Klei appends or
  // reorders a game enum (as U59 did to SceneLayer and BuildLocationRule), a
  // fresh import fails here naming the building and the unmapped value.
  describe('enum coverage', () => {
    it('every building uses defined ZIndex, Overlay, and BuildLocationRule members', () => {
      const unmapped: string[] = [];
      for (const b of database.buildings) {
        if (ZIndex[b.sceneLayer] === undefined)
          unmapped.push(`${b.prefabId}: sceneLayer ${b.sceneLayer}`);
        if (Overlay[b.viewMode] === undefined)
          unmapped.push(`${b.prefabId}: viewMode ${b.viewMode}`);
        if (BuildLocationRule[b.buildLocationRule] === undefined)
          unmapped.push(`${b.prefabId}: buildLocationRule ${b.buildLocationRule}`);
        for (const u of b.utilities ?? [])
          if (ConnectionType[u.type] === undefined)
            unmapped.push(`${b.prefabId}: connection type ${u.type}`);
      }
      expect(unmapped, unmapped.join('; ')).to.be.empty;
    });

    it('every DLC id in the database is known to the blueprint analyzer', () => {
      // Must stay in sync with DLC_TO_GAME_VERSION in lib/src/blueprint/blueprint-analyzer.ts.
      // A failure here means a new DLC arrived: add its GameVersion mapping there first.
      const knownDlcIds = new Set(['EXPANSION1_ID', 'DLC2_ID', 'DLC5_ID']);
      const unknown = new Set<string>();
      for (const b of database.buildings)
        for (const dlcId of b.dlcIds ?? []) if (!knownDlcIds.has(dlcId)) unknown.add(dlcId);
      expect([...unknown], `unknown DLC ids: ${[...unknown].join(', ')}`).to.be.empty;
    });
  });

  // PixelPack (a wall-plane decal, ObjectLayer.Backwall) and the Portrait Canvas
  // (ObjectLayer.Building) both sit at the InteriorWall scene layer, so at rest
  // they tie on sceneLayer alone. PixelPack is architecturally "behind the wall"
  // (like drywall) and must never exactly tie with - let alone render in front
  // of - a portrait mounted on it. Before the objectLayerBackwall depth offset,
  // both got the exact same computed `depth` in Base, and PIXI's
  // Container.sortChildren() breaks such ties using an index it re-stamps from
  // current array position on every call - so a real, temporary depth
  // divergence (this pair diverges under the Automation overlay, since
  // PixelPack has an automation viewMode) permanently reordered them even after
  // returning to Base, where they tie again.
  describe('render depth ordering (BlueprintItem.cameraChanged)', () => {
    it('PixelPack (Backwall) never ties with Canvas (Building) at rest, and reverts deterministically', () => {
      const pixelPack = new BlueprintItem('PixelPack');
      const canvas = new BlueprintItem('Canvas');
      const camera = new CameraService({});

      // Base (both before and after the Automation round-trip): both are
      // "primary" at the InteriorWall tier - PixelPack must lose the tie,
      // and must do so identically each time (no hysteresis from the switch).
      for (const _ of [0, 1]) {
        camera.overlay = Overlay.Base;
        pixelPack.cameraChanged(camera);
        canvas.cameraChanged(camera);
        expect(pixelPack.depth, 'PixelPack.depth in Base').to.be.lessThan(canvas.depth);

        // Automation: PixelPack has a wire connection and is meant to highlight
        // forward (like wires popping above tiles in the Power overlay) while
        // the unrelated Canvas dims to alpha 0.3 - intentional, not the bug.
        camera.overlay = Overlay.Automation;
        pixelPack.cameraChanged(camera);
        canvas.cameraChanged(camera);
        expect(pixelPack.depth, 'PixelPack.depth in Automation').to.be.greaterThan(canvas.depth);
        expect(canvas.isOpaque, 'Canvas.isOpaque in Automation').to.equal(false);
      }
    });
  });

  // Placement rules for the buildings whose rules the site actually branches on
  // (bridge detection in the frontend build tool) plus the U59 additions.
  describe('build location rules', () => {
    const rules: [string, BuildLocationRule][] = [
      ['LiquidConduitBridge', BuildLocationRule.Conduit],
      ['WireBridge', BuildLocationRule.WireBridge],
      ['LogicWireBridge', BuildLocationRule.LogicBridge],
      ['WireBridgeHighWattage', BuildLocationRule.HighWattBridgeTile],
      ['ContactConductivePipeBridge', BuildLocationRule.NoLiquidConduitAtOrigin],
      ['WallToilet', BuildLocationRule.WallFloor],
      ['RocketInteriorGasInput', BuildLocationRule.OnRocketEnvelope],
      ['UnderwaterMilkingStation', BuildLocationRule.Underwater],
    ];
    for (const [prefabId, rule] of rules) {
      it(`${prefabId} is ${BuildLocationRule[rule]}`, () => {
        const record = buildingsById.get(prefabId);
        expect(record, `${prefabId} missing from database`).to.exist;
        expect(record.buildLocationRule).to.equal(rule);
      });
    }
  });
});
