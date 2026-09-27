import { expect } from 'chai';
import { Blueprint, BlueprintHelpers, BlueprintItemTile, MdbBlueprint, Vector2 } from '../../lib';
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
    expect(blueprint.getBoundingBox()).to.deep.equal([new Vector2(0, 0), new Vector2(2, 1)]);
  });
});

// importFromMdb used to emit a change event per added item, and every emit
// re-ran updateTileables over all items so far -- O(n^2), 16s of an
// 8,612-item preview render. It now emits once for the whole import.
describe('Blueprint import: one change event per import', function () {
  before(function () {
    loadGameDatabase();
  });

  // A two-row block of tiles: each tile's connection mask (which edge art it
  // draws) comes from updateTileables, so a skipped pass leaves visible seams.
  function tilesMdb(width: number): MdbBlueprint {
    const blueprintItems: MdbBlueprint['blueprintItems'] = [];
    for (let x = 0; x < width; x++)
      for (let y = 0; y < 2; y++) blueprintItems.push({ id: 'Tile', position: { x, y } } as any);
    return { blueprintItems };
  }

  const connections = (blueprint: Blueprint) =>
    blueprint.blueprintItems.map(item => (item as BlueprintItemTile).tileConnections);

  it('fires blueprintChanged once, after every itemAdded', () => {
    const blueprint = new Blueprint();
    let changed = 0;
    let added = 0;
    let addedBeforeChange = -1;
    blueprint.subscribeBlueprintChanged({
      itemDestroyed() {},
      itemAdded() {
        added++;
      },
      blueprintChanged() {
        changed++;
        addedBeforeChange = added;
      },
    });

    blueprint.importFromMdb(tilesMdb(50));

    expect(blueprint.blueprintItems).to.have.length(100);
    expect(changed).to.equal(1);
    expect(added).to.equal(100);
    expect(addedBeforeChange).to.equal(100);
  });

  it('leaves every tile connected as a fresh updateTileables pass would', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb(tilesMdb(20));

    const afterImport = connections(blueprint);
    for (const item of blueprint.blueprintItems) item.updateTileables(blueprint);
    expect(afterImport).to.deep.equal(connections(blueprint));

    // And the pass actually ran: away from the ends, every tile joins left,
    // right and its vertical neighbour (1 + 2 + 4 or 8).
    const inner = blueprint.blueprintItems.filter(
      item => item.position.x > 0 && item.position.x < 19
    ) as BlueprintItemTile[];
    expect(inner.map(tile => tile.tileConnections & 3)).to.deep.equal(inner.map(() => 3));
    expect(inner.every(tile => (tile.tileConnections & 12) !== 0)).to.equal(true);
  });

  it('keeps change events paused when the caller had already paused them', () => {
    const blueprint = new Blueprint();
    let changed = 0;
    let added = 0;
    blueprint.subscribeBlueprintChanged({
      itemDestroyed() {},
      itemAdded() {
        added++;
      },
      blueprintChanged() {
        changed++;
      },
    });

    blueprint.pauseChangeEvents();
    blueprint.importFromMdb(tilesMdb(5));
    expect(changed).to.equal(0);
    expect(added).to.equal(0);
    blueprint.resumeChangeEvents(true);
    expect(changed).to.equal(1);
  });
});
