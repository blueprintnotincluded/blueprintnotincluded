import { expect } from 'chai';
import { Blueprint, BlueprintHelpers, MdbBlueprint, Vector2 } from '../../lib';
import { loadGameDatabase } from '../helpers/roomFixtures';

// Regression coverage for a real prod crash: a legacy blueprint referencing a
// building id the current database no longer knows (a stale mod id, or a
// prefab renamed upstream — e.g. CosmicResearchCenter -> DLC1CosmicResearchCenter)
// must degrade to `hadUnknownBuildings`, not throw and abort the whole import.
describe('Blueprint import: unknown building ids', function () {
  before(function () {
    loadGameDatabase();
  });

  it('BlueprintHelpers.createInstance returns null for an unknown id instead of throwing', () => {
    expect(() => BlueprintHelpers.createInstance('NotARealBuildingId')).to.not.throw();
    expect(BlueprintHelpers.createInstance('NotARealBuildingId')).to.equal(null);
  });

  it('importFromMdb skips unknown buildings, flags hadUnknownBuildings, and keeps known ones', () => {
    const mdb: MdbBlueprint = {
      blueprintItems: [{ id: 'Tile' }, { id: 'NotARealBuildingId' }],
    };

    const blueprint = new Blueprint();
    expect(() => blueprint.importFromMdb(mdb)).to.not.throw();

    expect(blueprint.hadUnknownBuildings).to.equal(true);
    expect(blueprint.blueprintItems).to.have.length(1);
    expect(blueprint.blueprintItems[0].id).to.equal('Tile');
  });

  it('importFromMdb leaves hadUnknownBuildings false when every id is known', () => {
    const mdb: MdbBlueprint = { blueprintItems: [{ id: 'Tile' }] };

    const blueprint = new Blueprint();
    blueprint.importFromMdb(mdb);

    expect(blueprint.hadUnknownBuildings).to.equal(false);
    expect(blueprint.blueprintItems).to.have.length(1);
  });
});

describe('Blueprint import: Planning Tool shapes', function () {
  const plans = [
    { x: 0, y: 0, shape: 0, color: 1 },
    { x: 2, y: 1, shape: 2, color: 10 },
  ];

  it('imports shapes from BlueprintsV2 and preserves them through MDB', () => {
    const imported = new Blueprint();
    imported.importFromBni({
      friendlyname: 'plans',
      buildings: [],
      digcommands: plans.map(({ x, y }) => ({ x, y })),
      planningtoolmod_shapecollection: plans,
    });

    expect(imported.planningToolShapes).to.deep.equal(plans);
    const reopened = new Blueprint();
    reopened.importFromMdb(imported.toMdbBlueprint());
    expect(reopened.planningToolShapes).to.deep.equal(plans);
  });

  it('exports game-compatible planning cells and dig commands', () => {
    const blueprint = new Blueprint();
    blueprint.planningToolShapes = plans;
    const exported = blueprint.toBniBlueprint('plans');

    expect(exported.blueprintVersion).to.equal(3);
    expect(exported.planningtoolmod_shapecollection).to.deep.equal(plans);
    expect(exported.digcommands).to.deep.equal([
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('includes planning-only cells in the camera bounds', () => {
    const blueprint = new Blueprint();
    blueprint.planningToolShapes = plans;
    expect(blueprint.getBoundingBox()).to.deep.equal([
      new Vector2(0, 0),
      new Vector2(2, 1),
    ]);
  });
});
