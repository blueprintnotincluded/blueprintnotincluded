import { expect } from 'chai';
import { DLC_LABELS, deriveRequiredDlcs, dlcLabel } from '../../lib';

// The DLC requirement set: an unordered union of the raw Klei ids a blueprint's
// buildings need. Deliberately not the old ordered gameVersion — see
// spec/dlc-requirements-plan.md for why no ordering can be correct here.
describe('deriveRequiredDlcs (DLC requirement set)', () => {
  it('returns [] for a blueprint with no buildings', () => {
    expect(deriveRequiredDlcs([])).to.deep.equal([]);
  });

  it('returns [] when every building is base game', () => {
    expect(deriveRequiredDlcs([[], [], []])).to.deep.equal([]);
  });

  it('returns the single id a one-DLC blueprint needs', () => {
    expect(deriveRequiredDlcs([['DLC2_ID'], []])).to.deep.equal(['DLC2_ID']);
  });

  it('unions the ids across buildings', () => {
    expect(deriveRequiredDlcs([['EXPANSION1_ID'], ['DLC2_ID'], []])).to.deep.equal([
      'DLC2_ID',
      'EXPANSION1_ID',
    ]);
  });

  it('dedupes ids repeated across buildings', () => {
    expect(deriveRequiredDlcs([['DLC3_ID'], ['DLC3_ID'], ['DLC3_ID']])).to.deep.equal(['DLC3_ID']);
  });

  it('sorts, so the stored value does not depend on building order', () => {
    const a = deriveRequiredDlcs([['DLC5_ID'], ['DLC2_ID'], ['EXPANSION1_ID']]);
    const b = deriveRequiredDlcs([['EXPANSION1_ID'], ['DLC5_ID'], ['DLC2_ID']]);
    expect(a).to.deep.equal(['DLC2_ID', 'DLC5_ID', 'EXPANSION1_ID']);
    expect(a).to.deep.equal(b);
  });

  // The case the old single-valued model could not express at all: owning the
  // Bionic Booster Pack implies nothing about owning Frosty Planet, so a
  // blueprint using both must report both.
  it('reports every pack a mixed blueprint needs', () => {
    expect(deriveRequiredDlcs([['DLC2_ID'], ['DLC3_ID']])).to.deep.equal(['DLC2_ID', 'DLC3_ID']);
  });

  // Multiple ids on one building are AND — RoboPilotModule needs Spaced Out AND
  // the Bionic Booster Pack — which is exactly what a union preserves.
  it('keeps both ids of an AND building', () => {
    expect(deriveRequiredDlcs([['EXPANSION1_ID', 'DLC3_ID']])).to.deep.equal([
      'DLC3_ID',
      'EXPANSION1_ID',
    ]);
  });

  // Spaced Out gets no special treatment: it is one id among the others, and a
  // blueprint that happens to use only classic content is buildable by anyone
  // regardless of what its author was playing.
  it('treats EXPANSION1_ID like any other id', () => {
    expect(deriveRequiredDlcs([['EXPANSION1_ID'], []])).to.deep.equal(['EXPANSION1_ID']);
  });

  it('passes through ids it has never heard of', () => {
    expect(deriveRequiredDlcs([['DLC99_ID']])).to.deep.equal(['DLC99_ID']);
  });
});

describe('dlcLabel', () => {
  it('labels the packs with the names the game itself uses', () => {
    expect(dlcLabel('EXPANSION1_ID')).to.equal('Spaced Out!');
    expect(dlcLabel('DLC2_ID')).to.equal('The Frosty Planet Pack');
    expect(dlcLabel('DLC3_ID')).to.equal('The Bionic Booster Pack');
    expect(dlcLabel('DLC4_ID')).to.equal('The Prehistoric Planet Pack');
    expect(dlcLabel('DLC5_ID')).to.equal('The Aquatic Planet Pack');
  });

  // A pack we don't know yet must stay visible (ugly-but-correct) rather than
  // drop out of the UI or a filter built on these labels.
  it('falls back to the raw id for an unknown DLC', () => {
    expect(dlcLabel('DLC99_ID')).to.equal('DLC99_ID');
    expect(DLC_LABELS['DLC99_ID']).to.be.undefined;
  });
});
