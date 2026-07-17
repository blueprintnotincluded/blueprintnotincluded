import { expect } from 'chai';
import { Blueprint, BlueprintHelpers, MdbBlueprint } from '../../lib';
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
