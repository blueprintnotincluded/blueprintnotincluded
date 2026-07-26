import { expect } from 'chai';
import * as path from 'path';
import { OniItem, deriveModded } from '../../lib';
import { buildLookups } from '../../app/api/batch/derive-blueprint-metadata';

// Regression guard for the modded false-positive bug: 'Element' and 'Info' are
// editor annotations synthesized by OniItem.load at runtime, so they appear in
// OniItem.oniItems but never in database-2024.json.buildings. The backfill
// script builds its knownIds from that file, so it counted every annotated
// blueprint as modded — 51% of the prod corpus, from exactly two ids.
describe('derive-blueprint-metadata lookups', () => {
  const dbPath = path.resolve(__dirname, '../../assets/database/database-2024.json');
  const { knownIds, dlcIdsMap } = buildLookups(dbPath);

  it('knows the real buildings from the database', () => {
    expect(knownIds.has('Tile')).to.equal(true);
    expect(knownIds.has('Electrolyzer')).to.equal(true);
  });

  it('treats the synthesized editor annotations as known, not as mod content', () => {
    expect(knownIds.has(OniItem.elementId)).to.equal(true);
    expect(knownIds.has(OniItem.infoId)).to.equal(true);
  });

  it('does not flag an annotated vanilla blueprint as modded', () => {
    const prefabIds = ['Tile', OniItem.elementId, OniItem.infoId];
    expect(deriveModded(prefabIds, knownIds, new Map())).to.equal(false);
  });

  it('still flags a genuinely unknown building as modded', () => {
    expect(deriveModded(['Tile', 'TotallyFakeModBuilding'], knownIds, new Map())).to.equal(true);
  });

  it('carries no DLC requirement for the annotations', () => {
    // They aren't in the database at all, so they contribute [] — asserted so
    // that adding them to knownIds can never be mistaken for giving them DLC
    // data they don't have.
    expect(dlcIdsMap.get(OniItem.elementId)).to.equal(undefined);
    expect(dlcIdsMap.get(OniItem.infoId)).to.equal(undefined);
  });
});
