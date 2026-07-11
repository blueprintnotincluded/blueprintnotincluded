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

  // Room detection reads isFoundation (NOT isTile: that's also true for
  // kanim-tiled wires/pipes) and roomTags. If a fresh export breaks these,
  // rooms would silently seal on wires or lose building roles.
  describe('room detection contract (isFoundation / roomTags)', () => {
    const foundationFacts: [string, boolean, boolean][] = [
      // [prefab, isTile, isFoundation]
      ['Tile', true, true],
      ['MeshTile', true, true], // gas-permeable, still bounds rooms
      ['FarmTile', true, true],
      ['Wire', true, false], // kanim tile render-wise, never bounds rooms
      ['LiquidConduit', true, false],
      ['Door', false, false], // pneumatic door bounds via the curated door list
      ['Bed', false, false],
    ];
    for (const [id, isTile, isFoundation] of foundationFacts) {
      it(`${id}: isTile=${isTile}, isFoundation=${isFoundation}`, () => {
        const item = OniItem.getOniItem(id);
        expect(item.isTile, 'isTile').to.equal(isTile);
        expect(item.isFoundation, 'isFoundation').to.equal(isFoundation);
      });
    }

    it('key room roles carry their tags', () => {
      expect(OniItem.getOniItem('FlushToilet').roomTags).to.include.members([
        'ToiletType',
        'FlushToiletType',
      ]);
      expect(OniItem.getOniItem('Generator').roomTags).to.include('IndustrialMachinery');
      expect(OniItem.getOniItem('MachineShop').roomTags).to.include('MachineShopType');
      expect(OniItem.getOniItem('Tile').roomTags).to.deep.equal([]);
    });
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

  // PixelPack is a wall-plane decal (ObjectLayer.Backwall) that sits flush in the
  // wall - like drywall - behind whatever building is placed against it. Since the
  // game forbids buildings from overlapping each other, the only render-order
  // comparison that is ever visually observed is "some buildable vs a decal on the
  // same wall", never buildable-vs-buildable: so the decal must lose that
  // comparison unconditionally, regardless of its own scene layer/overlay boost or
  // the other building's. A relative per-tier offset (e.g. nudging just enough to
  // beat buildings sharing PixelPack's own InteriorWall tier) is not enough - it
  // silently fails against a building on any *higher* tier that also gets a
  // boost, such as a Building-layer light fixture in the Base overlay (their tier
  // gap alone already separates them; the boost widens it further in the wrong
  // direction only for pairs living below PixelPack's own tier). This pins the
  // absolute, tier-independent invariant instead of re-deriving it per pair.
  describe('render depth ordering (BlueprintItem.cameraChanged)', () => {
    const expectAlwaysBehind = (packId: string, buildingId: string) => {
      const pack = new BlueprintItem(packId);
      const building = new BlueprintItem(buildingId);
      const camera = new CameraService({});

      for (const overlay of [Overlay.Base, Overlay.Automation, Overlay.Base]) {
        camera.overlay = overlay;
        pack.cameraChanged(camera);
        building.cameraChanged(camera);
        expect(
          pack.depth,
          `${packId}.depth vs ${buildingId}.depth in ${Overlay[overlay]}`
        ).to.be.lessThan(building.depth);
      }
    };

    it('PixelPack stays behind the Portrait Canvas (same InteriorWall scene layer)', () => {
      expectAlwaysBehind('PixelPack', 'Canvas');
    });

    it('PixelPack stays behind a Mercury Ceiling Light (higher Building scene layer)', () => {
      expectAlwaysBehind('PixelPack', 'MercuryCeilingLight');
    });

    it('PixelPack still highlights as opaque in the Automation overlay (alpha, not depth, signals relevance)', () => {
      const pixelPack = new BlueprintItem('PixelPack');
      const camera = new CameraService({});
      camera.overlay = Overlay.Automation;
      pixelPack.cameraChanged(camera);
      expect(pixelPack.isOpaque).to.equal(true);
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
