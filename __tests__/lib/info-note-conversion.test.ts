import { expect } from 'chai';
import { Blueprint, InfoIcon, MdbBlueprint, Vector2, infoBuildingToWorldNote } from '../../lib';
import { loadGameDatabase } from '../helpers/roomFixtures';

// `Info` was the website's own annotation type: a pseudo-building carrying a
// title, a body and a coloured badge. It had no place in a .blueprint file, so
// downloading a blueprint annotated on the website silently dropped every
// annotation — the bug this conversion exists to close.
//
// The mod's world notes are now the only annotation model, and `Info` is an
// input format that converts on read.

describe('Info -> world note conversion', function () {
  it('carries position, title, body, colour and icon across', () => {
    const note = infoBuildingToWorldNote({
      id: 'Info',
      position: new Vector2(3, -4),
      title: 'Timers',
      infoString: 'Green: 9\nRed: 11',
      backColor: 0xd90065,
      icon: InfoIcon.icon_exc,
    });

    expect(note).to.deep.equal({
      x: 3,
      y: -4,
      type: 0,
      title: 'Timers',
      text: 'Green: 9\nRed: 11',
      // The mod's Color.ToHexString format, always opaque.
      tinthex: 'd90065ff',
      symbol: 'note_warn',
    });
  });

  it('writes the badge colour and icon explicitly, since the world note defaults differ', () => {
    // A bare `Info` item stored none of these — they were class defaults. Left
    // implicit, the converted note would render in the *world note* default
    // blue with the default sprite, i.e. not as the badge its author placed.
    const note = infoBuildingToWorldNote({ id: 'Info' });

    expect(note.tinthex).to.equal('007ad9ff');
    expect(note.symbol).to.equal('note_info');
  });

  it('maps every InfoIcon to a symbol the mod ships art for', () => {
    const symbols = [
      [InfoIcon.icon_inf, 'note_info'],
      [InfoIcon.icon_int, 'note_question'],
      [InfoIcon.icon_exc, 'note_warn'],
      [InfoIcon.icon_no1, 'note_num_1'],
      [InfoIcon.icon_no5, 'note_num_5'],
      [InfoIcon.icon_no9, 'note_num_9'],
    ] as const;

    for (const [icon, symbol] of symbols)
      expect(infoBuildingToWorldNote({ id: 'Info', icon }).symbol).to.equal(symbol);
  });

  it('omits an empty title and body rather than writing blank strings', () => {
    const note = infoBuildingToWorldNote({ id: 'Info', title: '', infoString: '' });

    expect(note).to.not.have.property('title');
    expect(note).to.not.have.property('text');
  });
});

describe('Blueprint import: legacy Info annotations', function () {
  before(function () {
    loadGameDatabase();
  });

  const withInfo = (): MdbBlueprint => ({
    blueprintItems: [
      { id: 'Tile', position: new Vector2(0, 0) },
      { id: 'Info', position: new Vector2(1, 2), title: 'Read me' },
    ],
  });

  it('converts stored Info items to world notes instead of blueprint items', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb(withInfo());

    expect(blueprint.blueprintItems.map(item => item.id)).to.deep.equal(['Tile']);
    expect(blueprint.worldNotes).to.have.length(1);
    expect(blueprint.worldNotes[0]).to.include({ x: 1, y: 2, title: 'Read me' });
  });

  it('does not flag the blueprint as modded — Info is ours, not an unknown prefab', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb(withInfo());

    expect(blueprint.hadUnknownBuildings).to.equal(false);
    expect(blueprint.unknownBuildingDefs).to.deep.equal([]);
  });

  it('writes the annotation back out as a world note, never as a building', () => {
    // The whole point: `Info` could not be exported at all, so a download lost
    // it. As a world note it survives the round trip into the game.
    const blueprint = new Blueprint();
    blueprint.importFromMdb(withInfo());

    const bni = blueprint.toBniBlueprint('test');

    expect(bni.buildings!.map(b => b.buildingdef)).to.deep.equal(['Tile']);
    expect(bni.worldNotes).to.have.length(1);
    expect(bni.worldNotes![0]).to.include({ title: 'Read me' });
    // World notes are a v3 feature; the mod needs the version to read them.
    expect(bni.blueprintVersion).to.equal(3);
  });

  it('re-saving converts the stored blueprint, so the next read has no Info left', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb(withInfo());

    const mdb = blueprint.toMdbBlueprint();

    expect(mdb.blueprintItems.map(item => item.id)).to.deep.equal(['Tile']);
    expect(mdb.worldNotes).to.have.length(1);
  });

  it('re-origins converted annotations with the buildings, as the mod would', () => {
    // toBniBlueprint mirrors the mod's SanitizePositions(), which shifts world
    // notes along with buildings. A converted note has to move with them or it
    // detaches from what it annotates.
    const blueprint = new Blueprint();
    blueprint.importFromMdb({
      blueprintItems: [
        { id: 'Tile', position: new Vector2(-2, -3) },
        { id: 'Info', position: new Vector2(-1, -1) },
      ],
    });

    const bni = blueprint.toBniBlueprint('test');

    expect(bni.buildings![0].offset).to.include({ x: 0, y: 0 });
    expect(bni.worldNotes![0]).to.include({ x: 1, y: 2 });
  });

  it('keeps notes that were already world notes alongside converted ones', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb({
      blueprintItems: [{ id: 'Info', position: new Vector2(5, 5) }],
      worldNotes: [{ x: 0, y: 0, type: 0, title: 'from the game' }],
    });

    expect(blueprint.worldNotes.map(note => note.title)).to.deep.equal([
      'from the game',
      undefined,
    ]);
  });
});
