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
});
