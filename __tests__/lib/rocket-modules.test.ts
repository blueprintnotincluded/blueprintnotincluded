import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import {
  Blueprint,
  BlueprintHelpers,
  BniBlueprint,
  OniItem,
  Orientation,
  PermittedRotations,
  ROCKET_ATTACH_TAG,
  Vector2,
  attachesToRocket,
  positionForAttachCell,
  rocketAttachCell,
  rocketHardpointCell,
  snapRocketModulePosition,
  BuildMenuCategory,
  BuildMenuItem,
  BlueprintItem,
  analyzeRocketStacks,
  rocketStackParts,
  rocketStackWarnings,
  RocketStackPart,
} from '../../lib';
import { loadGameDatabase } from '../helpers/roomFixtures';

// SYNTHETIC fixture: two ArtifactCargoBay modules, the upper one at the lower one's
// rocket hardpoint and flipped -- the Blueprints Included harness case
// `rocket-modules-stack-on-previewed-hardpoints`, rebuilt from the export's real
// attachPoints offsets rather than captured from a game. A rocket module in a
// .blueprint is an ordinary buildings[] entry (prefab id, origin-cell offset,
// orientation 0 or FlipH=5, material hashes), so the shape is the mod's; what a real
// capture would add is realistic `buildingData`.
const STACK_FIXTURE_PATH = path.join(
  __dirname,
  '../fixtures/rocket-modules-stack-synthetic.blueprint'
);

describe('Rocket modules', function () {
  let fixture: BniBlueprint;

  before(function () {
    loadGameDatabase();
    fixture = JSON.parse(fs.readFileSync(STACK_FIXTURE_PATH, 'utf8'));
  });

  describe('module data carried from the export', function () {
    it('tags the 32 modules and nothing else', () => {
      const modules = OniItem.oniItems.filter(item => item.isRocketModule);
      expect(modules).to.have.length(32);
      expect(OniItem.getOniItem('LaunchPad').isRocketModule).to.equal(false);
      // attachableTo "Rocket" without being a module: the base-game capsule.
      expect(OniItem.getOniItem('CrewCapsule').attachableTo).to.equal(ROCKET_ATTACH_TAG);
      expect(OniItem.getOniItem('CrewCapsule').isRocketModule).to.equal(false);
    });

    it('gives every module a hardpoint one module-height above its origin, except the tops', () => {
      const topOnly: string[] = [];
      for (const item of OniItem.oniItems.filter(item => item.isRocketModule)) {
        expect(item.attachableTo, `${item.id} attachableTo`).to.equal(ROCKET_ATTACH_TAG);
        expect(item.attachablePosition.x, `${item.id} attachablePosition`).to.equal(0);
        expect(item.attachablePosition.y, `${item.id} attachablePosition`).to.equal(0);

        const point = item.rocketAttachPoint;
        if (point == null) {
          topOnly.push(item.id);
          expect(item.rocketModule!.buildConditions, `${item.id} conditions`).to.include('TopOnly');
          continue;
        }
        expect(point.offset, `${item.id} hardpoint`).to.deep.equal({ x: 0, y: item.size.y });
        expect(item.rocketModule!.buildConditions, `${item.id} conditions`).to.not.include(
          'TopOnly'
        );
      }
      expect(topOnly.sort()).to.deep.equal(['HabitatModuleSmall', 'NoseconeBasic', 'NoseconeHarvest']);
    });

    it('gives the launch pad the hardpoint a stack meets the ground on', () => {
      const pad = OniItem.getOniItem('LaunchPad');
      expect(pad.size.x).to.equal(7);
      expect(pad.size.y).to.equal(2);
      expect(pad.rocketAttachPoint).to.deep.equal({ offset: { x: 0, y: 2 }, tag: 'Rocket' });
      expect(pad.attachableTo).to.equal(undefined);
    });

    it('carries engine limits and module burden', () => {
      const engine = OniItem.getOniItem('KeroseneEngineCluster').rocketModule!;
      expect(engine.engineMaxHeight).to.equal(35);
      expect(engine.enginePower).to.equal(48);
      expect(engine.burden).to.equal(6);
      expect(engine.buildConditions).to.include.members(['EngineOnBottom', 'LimitOneEngine']);

      expect(OniItem.getOniItem('CO2Engine').rocketModule!.engineMaxHeight).to.equal(10);
      const cargo = OniItem.getOniItem('ArtifactCargoBay').rocketModule!;
      expect(cargo.engineMaxHeight).to.equal(undefined);
      expect(cargo.enginePower).to.equal(0);
    });

    it('leaves buildings that have no attachment model untouched', () => {
      const tile = OniItem.getOniItem('Tile');
      expect(tile.attachableTo).to.equal(undefined);
      expect(tile.attachPoints).to.deep.equal([]);
      expect(tile.rocketModule).to.equal(undefined);
      expect(tile.rocketAttachPoint).to.equal(undefined);
    });

    it('keeps the non-rocket attach tags without treating them as rocket hardpoints', () => {
      const monument = OniItem.getOniItem('MonumentBottom');
      expect(monument.attachPoints).to.deep.equal([
        { offset: { x: 0, y: 5 }, tag: 'MonumentMiddle' },
      ]);
      expect(monument.rocketAttachPoint).to.equal(undefined);
    });
  });

  // The game exports every module as Unrotatable; the mod lets them mirror
  // (RocketModuleVisual.GetAllowedRotations -> FlipH). The converter overrides it.
  describe('flip-only orientation', function () {
    it('lets every module flip horizontally, and do nothing else', () => {
      for (const item of OniItem.oniItems.filter(item => item.isRocketModule)) {
        expect(item.permittedRotations, item.id).to.equal(PermittedRotations.FlipH);
        expect(item.orientations, item.id).to.deep.equal([Orientation.Neutral, Orientation.FlipH]);
      }
    });

    it('cycles Neutral -> FlipH -> Neutral on the rotate action', () => {
      const module = BlueprintHelpers.createInstance('KeroseneEngineCluster')!;
      expect(module.orientation).to.equal(Orientation.Neutral);
      module.nextOrientation();
      expect(module.orientation).to.equal(Orientation.FlipH);
      module.nextOrientation();
      expect(module.orientation).to.equal(Orientation.Neutral);
    });

    it('occupies the same cells flipped, since every module is odd-width around its origin', () => {
      for (const item of OniItem.oniItems.filter(item => item.isRocketModule)) {
        expect(item.size.x % 2, `${item.id} width`).to.equal(1);
        const module = BlueprintHelpers.createInstance(item.id)!;
        module.position = new Vector2(10, 4);
        module.changeOrientation(Orientation.Neutral);
        const neutral = [...module.tileIndexes].sort();
        module.changeOrientation(Orientation.FlipH);
        expect([...module.tileIndexes].sort(), item.id).to.deep.equal(neutral);
      }
    });

    it('does not touch the launch pad, which the game really does not rotate', () => {
      expect(OniItem.getOniItem('LaunchPad').permittedRotations).to.equal(
        PermittedRotations.Unrotatable
      );
    });
  });

  describe('importing a blueprint with stacked modules', function () {
    let blueprint: Blueprint;

    before(function () {
      blueprint = new Blueprint();
      blueprint.importFromBni(fixture);
    });

    it('creates both instances at their own offsets', () => {
      expect(fixture.buildings).to.have.length(2);
      expect(blueprint.hadUnknownBuildings).to.equal(false);
      expect(blueprint.blueprintItems.map(item => item.id)).to.deep.equal([
        'ArtifactCargoBay',
        'ArtifactCargoBay',
      ]);
      expect(blueprint.blueprintItems.map(item => [item.position.x, item.position.y])).to.deep.equal([
        [1, 0],
        [1, 1],
      ]);
    });

    it('places the upper module exactly on the lower module\'s hardpoint', () => {
      const [lower, upper] = blueprint.blueprintItems;
      const hardpoint = rocketHardpointCell(lower)!;
      expect([hardpoint.x, hardpoint.y]).to.deep.equal([1, 1]);
      expect(attachesToRocket(upper)).to.equal(true);
      expect(rocketAttachCell(upper).equals(hardpoint)).to.equal(true);
    });

    it('keeps the flipped orientation, and the hardpoint does not move with it', () => {
      const [lower, upper] = blueprint.blueprintItems;
      expect(lower.orientation).to.equal(Orientation.Neutral);
      expect(upper.orientation).to.equal(Orientation.FlipH);
      const hardpoint = rocketHardpointCell(upper)!;
      expect([hardpoint.x, hardpoint.y]).to.deep.equal([1, 2]);
    });

    it('each module occupies its own row of three cells, with no overlap', () => {
      const [lower, upper] = blueprint.blueprintItems;
      expect([lower.topLeft.x, lower.topLeft.y, lower.bottomRight.x, lower.bottomRight.y]).to.deep.equal(
        [0, 0, 2, 0]
      );
      expect([upper.topLeft.x, upper.topLeft.y, upper.bottomRight.x, upper.bottomRight.y]).to.deep.equal(
        [0, 1, 2, 1]
      );
    });

    it('round-trips through mdb and back out to the same buildings', () => {
      const reimported = new Blueprint();
      reimported.importFromMdb(blueprint.toMdbBlueprint());
      const bni = reimported.toBniBlueprint('roundtrip');
      expect(
        bni.buildings.map(b => ({
          buildingdef: b.buildingdef,
          offset: { x: b.offset.x, y: b.offset.y },
          orientation: b.orientation,
          selected_elements: b.selected_elements,
        }))
      ).to.deep.equal(
        fixture.buildings.map(b => ({
          buildingdef: b.buildingdef,
          offset: { x: b.offset.x, y: b.offset.y },
          orientation: b.orientation ?? Orientation.Neutral,
          selected_elements: b.selected_elements,
        }))
      );
    });
  });

  describe('stacking geometry', function () {
    it('reports no hardpoint for a nosecone or a non-rocket building', () => {
      expect(rocketHardpointCell(BlueprintHelpers.createInstance('NoseconeBasic')!)).to.equal(null);
      expect(rocketHardpointCell(BlueprintHelpers.createInstance('Tile')!)).to.equal(null);
      expect(attachesToRocket(BlueprintHelpers.createInstance('Tile')!)).to.equal(false);
      expect(attachesToRocket(BlueprintHelpers.createInstance('LaunchPad')!)).to.equal(false);
    });

    it('puts the first module two cells above a launch pad origin', () => {
      const pad = BlueprintHelpers.createInstance('LaunchPad')!;
      pad.position = new Vector2(20, 5);
      const hardpoint = rocketHardpointCell(pad)!;
      expect([hardpoint.x, hardpoint.y]).to.deep.equal([20, 7]);

      const engine = BlueprintHelpers.createInstance('KeroseneEngineCluster')!;
      const position = positionForAttachCell(engine, hardpoint);
      expect([position.x, position.y]).to.deep.equal([20, 7]);
    });
  });
  // PLANORDER never lists a module, so the converter adds them to the rocketry tab
  // from the export's rocketModuleMenu. Without that a module can be imported but
  // never placed.
  describe('build menu', function () {
    let rocketryItems: string[];

    before(function () {
      const rocketry = BuildMenuCategory.buildMenuCategories.find(
        c => c.categoryName == 'rocketry'
      )!;
      rocketryItems = BuildMenuItem.buildMenuItems
        .filter(item => item.category == rocketry.category)
        .map(item => item.buildingId);
    });

    it('offers every module under rocketry, exactly once', () => {
      const modules = OniItem.oniItems.filter(item => item.isRocketModule).map(item => item.id);
      for (const id of modules)
        expect(rocketryItems.filter(item => item == id), id).to.have.length(1);
    });

    it('keeps the plan-menu rocketry buildings ahead of the modules', () => {
      const firstModule = rocketryItems.findIndex(id => OniItem.getOniItem(id).isRocketModule);
      expect(rocketryItems.slice(0, firstModule)).to.include.members(['LaunchPad', 'Gantry']);
      expect(
        rocketryItems.slice(firstModule).every(id => OniItem.getOniItem(id).isRocketModule)
      ).to.equal(true);
    });

    it('lists modules in the game module-screen order: engines first', () => {
      const modules = rocketryItems.filter(id => OniItem.getOniItem(id).isRocketModule);
      expect(modules.slice(0, 3)).to.deep.equal(['CO2Engine', 'SugarEngine', 'SteamEngineCluster']);
      const lastEngine = modules.reduce(
        (last, id, index) =>
          OniItem.getOniItem(id).rocketModule!.engineMaxHeight != null ? index : last,
        -1
      );
      expect(lastEngine).to.equal(7);
    });

    it('puts no module in any other tab', () => {
      const elsewhere = BuildMenuItem.buildMenuItems.filter(
        item => OniItem.getOniItem(item.buildingId).isRocketModule
      );
      expect(elsewhere).to.have.length(32);
    });
  });

  describe('snapping a module onto a hardpoint', function () {
    function placed(id: string, x: number, y: number): BlueprintItem {
      const item = BlueprintHelpers.createInstance(id)!;
      item.position = new Vector2(x, y);
      item.cleanUp();
      item.prepareBoundingBox();
      return item;
    }
    const xy = (v: Vector2 | null) => (v == null ? null : [v.x, v.y]);

    it('pulls a module onto the launch pad from anywhere inside the spot it would occupy', () => {
      const pad = placed('LaunchPad', 20, 5);
      const engine = BlueprintHelpers.createInstance('KeroseneEngineCluster')!; // 7x5
      // Dead on, the far corners of the footprint, and one cell outside it.
      expect(xy(snapRocketModulePosition(engine, new Vector2(20, 7), [pad]))).to.deep.equal([20, 7]);
      expect(xy(snapRocketModulePosition(engine, new Vector2(17, 7), [pad]))).to.deep.equal([20, 7]);
      expect(xy(snapRocketModulePosition(engine, new Vector2(23, 11), [pad]))).to.deep.equal([20, 7]);
      expect(xy(snapRocketModulePosition(engine, new Vector2(24, 12), [pad]))).to.deep.equal([20, 7]);
      expect(xy(snapRocketModulePosition(engine, new Vector2(20, 6), [pad]))).to.deep.equal([20, 7]);
    });

    it('leaves the module under the cursor when it is clear of every hardpoint', () => {
      const pad = placed('LaunchPad', 20, 5);
      const engine = BlueprintHelpers.createInstance('KeroseneEngineCluster')!;
      expect(snapRocketModulePosition(engine, new Vector2(25, 7), [pad])).to.equal(null);
      expect(snapRocketModulePosition(engine, new Vector2(20, 13), [pad])).to.equal(null);
      expect(snapRocketModulePosition(engine, new Vector2(20, 5), [pad])).to.equal(null);
      expect(snapRocketModulePosition(engine, new Vector2(20, 7), [])).to.equal(null);
    });

    it('stacks on the top of the stack, not on a hardpoint that is already taken', () => {
      const pad = placed('LaunchPad', 20, 5);
      const engine = placed('KeroseneEngineCluster', 20, 7); // hardpoint at (20,12)
      const tank = BlueprintHelpers.createInstance('LiquidFuelTankCluster')!; // 5x5
      // Hovering low in the stack, inside the engine: the pad's hardpoint is taken,
      // so there is nothing to snap to down there.
      expect(snapRocketModulePosition(tank, new Vector2(20, 7), [pad, engine])).to.equal(null);
      // Hovering where the tank would go.
      expect(xy(snapRocketModulePosition(tank, new Vector2(21, 13), [pad, engine]))).to.deep.equal([
        20,
        12,
      ]);
    });

    it('picks the nearer of two stacks', () => {
      const left = placed('LaunchPad', 10, 0);
      const right = placed('LaunchPad', 18, 0);
      const engine = BlueprintHelpers.createInstance('CO2Engine')!; // 3x2
      expect(xy(snapRocketModulePosition(engine, new Vector2(11, 2), [left, right]))).to.deep.equal([
        10,
        2,
      ]);
      expect(xy(snapRocketModulePosition(engine, new Vector2(17, 2), [left, right]))).to.deep.equal([
        18,
        2,
      ]);
    });

    it('never snaps onto a nosecone, which offers no hardpoint', () => {
      const nose = placed('NoseconeBasic', 20, 12);
      const cargo = BlueprintHelpers.createInstance('ArtifactCargoBay')!;
      expect(snapRocketModulePosition(cargo, new Vector2(20, 14), [nose])).to.equal(null);
    });

    it('does nothing for a building that is not a rocket module', () => {
      const pad = placed('LaunchPad', 20, 5);
      const tile = BlueprintHelpers.createInstance('Tile')!;
      expect(snapRocketModulePosition(tile, new Vector2(20, 7), [pad])).to.equal(null);
      // CrewCapsule attaches to "Rocket" in the base game but is not a module.
      const capsule = BlueprintHelpers.createInstance('CrewCapsule')!;
      expect(snapRocketModulePosition(capsule, new Vector2(20, 7), [pad])).to.equal(null);
    });

    it('ignores the brush itself when it is in the list', () => {
      const pad = placed('LaunchPad', 20, 5);
      const engine = placed('KeroseneEngineCluster', 20, 7);
      // The engine already sits on the pad: asked about itself, the pad is still free.
      expect(xy(snapRocketModulePosition(engine, new Vector2(20, 7), [pad, engine]))).to.deep.equal(
        [20, 7]
      );
    });
  });
  // Phase 3. The mod refuses these placements in game; the site says so beforehand.
  describe('stack validation', function () {
    function placed(id: string, x: number, y: number): BlueprintItem {
      const item = BlueprintHelpers.createInstance(id)!;
      item.position = new Vector2(x, y);
      item.cleanUp();
      item.prepareBoundingBox();
      return item;
    }
    // Stacks `ids` bottom-up on a hardpoint starting at (x, y), each on the one below.
    function stack(x: number, y: number, ids: string[]): BlueprintItem[] {
      const items: BlueprintItem[] = [];
      let cursor = y;
      for (const id of ids) {
        items.push(placed(id, x, cursor));
        cursor += OniItem.getOniItem(id).size.y;
      }
      return items;
    }
    const kinds = (items: BlueprintItem[]) => rocketStackWarnings(items).map(w => w.kind);

    it('finds nothing wrong with a complete rocket on a platform', () => {
      const rocket = [
        placed('LaunchPad', 20, 0),
        ...stack(20, 2, [
          'KeroseneEngineCluster',
          'LiquidFuelTankCluster',
          'OxidizerTankCluster',
          'HabitatModuleMedium',
          'NoseconeBasic',
        ]),
      ];
      expect(rocketStackWarnings(rocket)).to.deep.equal([]);
    });

    it('finds nothing wrong with the same rocket flipped module by module', () => {
      const rocket = [
        placed('LaunchPad', 20, 0),
        ...stack(20, 2, ['KeroseneEngineCluster', 'LiquidFuelTankCluster', 'NoseconeBasic']),
      ];
      for (const item of rocket.slice(1)) item.changeOrientation(Orientation.FlipH);
      expect(rocketStackWarnings(rocket)).to.deep.equal([]);
    });

    it('accepts a stack with no platform: it is pasted onto one that already exists', () => {
      expect(
        rocketStackWarnings(stack(20, 2, ['CO2Engine', 'HabitatModuleSmall']))
      ).to.deep.equal([]);
    });

    it('accepts the synthetic two-module fixture', () => {
      const blueprint = new Blueprint();
      blueprint.importFromBni(fixture);
      expect(rocketStackWarnings(blueprint.blueprintItems)).to.deep.equal([]);
    });

    it('ignores a blueprint with no rocket in it', () => {
      expect(rocketStackWarnings([placed('Tile', 0, 0), placed('LaunchPad', 10, 0)])).to.deep.equal(
        []
      );
      expect(rocketStackParts([placed('Tile', 0, 0)])).to.deep.equal([]);
    });

    it('reports a module one cell off the platform, and how far to move it', () => {
      const pad = placed('LaunchPad', 20, 0);
      expect(rocketStackWarnings([pad, placed('KeroseneEngineCluster', 21, 2)])).to.deep.equal([
        {
          kind: 'misaligned',
          module: { prefabId: 'KeroseneEngineCluster', x: 21, y: 2 },
          hardpointOwner: { prefabId: 'LaunchPad', x: 20, y: 0 },
          offset: { x: -1, y: 0 },
        },
      ]);
      // One row too high.
      expect(
        rocketStackWarnings([pad, placed('KeroseneEngineCluster', 20, 3)])[0]
      ).to.deep.include({ kind: 'misaligned', offset: { x: 0, y: -1 } });
    });

    it('reports a module that misses the module below it', () => {
      const items = [
        placed('LaunchPad', 20, 0),
        placed('KeroseneEngineCluster', 20, 2),
        placed('LiquidFuelTankCluster', 22, 7), // hardpoint is at (20,7)
      ];
      expect(rocketStackWarnings(items)).to.deep.equal([
        {
          kind: 'misaligned',
          module: { prefabId: 'LiquidFuelTankCluster', x: 22, y: 7 },
          hardpointOwner: { prefabId: 'KeroseneEngineCluster', x: 20, y: 2 },
          offset: { x: -2, y: 0 },
        },
      ]);
    });

    it('does not call a stack misaligned for standing clear of another one', () => {
      const items = [
        placed('LaunchPad', 20, 0),
        placed('CO2Engine', 40, 2),
        placed('CO2Engine', 20, 6),
      ];
      expect(rocketStackWarnings(items)).to.deep.equal([]);
    });

    it('does not point a stray module at a hardpoint that is already taken', () => {
      const items = [
        placed('LaunchPad', 20, 0),
        placed('KeroseneEngineCluster', 20, 2),
        placed('CO2Engine', 26, 2), // beside the engine, not on the pad
      ];
      // The pad's hardpoint is taken by the petroleum engine; the engine's own
      // hardpoint (20,7) is five rows up. Nothing nearby to have missed.
      expect(rocketStackWarnings(items)).to.deep.equal([]);
    });

    it('reports a module stacked on a nosecone', () => {
      const items = stack(20, 2, ['CO2Engine', 'NoseconeBasic', 'SolidCargoBaySmall']);
      expect(rocketStackWarnings(items)).to.deep.equal([
        {
          kind: 'onTopOnly',
          module: { prefabId: 'SolidCargoBaySmall', x: 20, y: 6 },
          below: { prefabId: 'NoseconeBasic', x: 20, y: 4 },
        },
      ]);
    });

    it('reports an engine that is not the bottom module', () => {
      const items = [
        placed('LaunchPad', 20, 0),
        ...stack(20, 2, ['SolidCargoBaySmall', 'CO2Engine']),
      ];
      expect(rocketStackWarnings(items)).to.deep.equal([
        {
          kind: 'engineNotOnBottom',
          module: { prefabId: 'CO2Engine', x: 20, y: 5 },
          below: { prefabId: 'SolidCargoBaySmall', x: 20, y: 2 },
        },
      ]);
    });

    it('reports two engines in one rocket, as both a limit and a misplaced engine', () => {
      expect(kinds(stack(20, 2, ['CO2Engine', 'SugarEngine']))).to.have.members([
        'engineNotOnBottom',
        'multipleEngines',
      ]);
    });

    it('reports two command modules in one rocket', () => {
      const items = stack(20, 2, ['CO2Engine', 'HabitatModuleMedium', 'HabitatModuleSmall']);
      const warnings = rocketStackWarnings(items);
      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.deep.equal({
        kind: 'multipleCommandModules',
        modules: [
          { prefabId: 'HabitatModuleMedium', x: 20, y: 4 },
          { prefabId: 'HabitatModuleSmall', x: 20, y: 8 },
        ],
      });
    });

    it('reports two robo-pilots in one rocket', () => {
      expect(kinds(stack(20, 2, ['CO2Engine', 'RoboPilotModule', 'RoboPilotModule']))).to.deep.equal(
        ['multipleRoboPilots']
      );
    });

    it('does not count modules across two separate rockets', () => {
      const items = [
        ...stack(20, 2, ['CO2Engine', 'HabitatModuleSmall']),
        ...stack(40, 2, ['SugarEngine', 'HabitatModuleSmall']),
      ];
      expect(rocketStackWarnings(items)).to.deep.equal([]);
    });

    it('reports a stack taller than its engine can lift', () => {
      // CO2 engine: 2 tall, lifts 10. 2 + 5 + 5 = 12.
      const items = stack(20, 2, ['CO2Engine', 'LiquidCargoBayCluster', 'GasCargoBayCluster']);
      expect(rocketStackWarnings(items)).to.deep.equal([
        {
          kind: 'tooTall',
          engine: { prefabId: 'CO2Engine', x: 20, y: 2 },
          height: 12,
          maxHeight: 10,
        },
      ]);
    });

    it('accepts a stack exactly at its engine\'s limit', () => {
      // 2 + 5 + 3 = 10.
      expect(
        rocketStackWarnings(stack(20, 2, ['CO2Engine', 'LiquidCargoBayCluster', 'ScoutModule']))
      ).to.deep.equal([]);
    });

    it('does not judge the height of a stack with no engine', () => {
      const items = stack(20, 2, [
        'LiquidCargoBayCluster',
        'GasCargoBayCluster',
        'CargoBayCluster',
        'LiquidFuelTankCluster',
        'OxidizerTankCluster',
        'ScannerModule',
        'LiquidCargoBayCluster',
        'GasCargoBayCluster',
      ]);
      expect(rocketStackWarnings(items)).to.deep.equal([]);
    });

    it('judges plain records, with no game database behind them', () => {
      const part = (overrides: Partial<RocketStackPart>): RocketStackPart => ({
        prefabId: 'Module',
        x: 0,
        y: 0,
        width: 3,
        height: 2,
        isModule: true,
        attachCell: { x: 0, y: 0 },
        hardpointCell: { x: 0, y: 2 },
        buildConditions: [],
        ...overrides,
      });
      expect(analyzeRocketStacks([])).to.deep.equal([]);
      expect(
        analyzeRocketStacks([
          part({ prefabId: 'Engine', buildConditions: ['EngineOnBottom'], engineMaxHeight: 3 }),
          part({ prefabId: 'Cargo', y: 2, attachCell: { x: 0, y: 2 }, hardpointCell: { x: 0, y: 4 } }),
        ])
      ).to.deep.equal([
        { kind: 'tooTall', engine: { prefabId: 'Engine', x: 0, y: 0 }, height: 4, maxHeight: 3 },
      ]);
    });
  });
});
