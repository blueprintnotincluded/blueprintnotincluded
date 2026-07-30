import { expect } from 'chai';
import {
  Blueprint,
  BniBlueprint,
  decodeTerrainFeatures,
  encodeTerrainFeatures,
  modSanitizeOffset,
  TERRAIN_METADATA_KEY,
  TERRAIN_SCHEMA_VERSION,
  Vector2,
} from '../../lib';
import { loadGameDatabase } from '../helpers/roomFixtures';

// Terrain annotations (geysers, vents, volcanoes) ride in the BlueprintsV2
// `metadata` block. Everything here is about surviving contact with the mod:
// its Dictionary<string, string> deserializer, and its SanitizePositions() pass.

function encoded(features: { id: string; x: number; y: number }[]): Record<string, string> {
  const metadata = encodeTerrainFeatures({}, features);
  expect(metadata).to.not.equal(undefined);
  return metadata!;
}

describe('Terrain metadata: encoding', function () {
  it('encodes the payload as a JSON *string*, since the mod drops non-string values', () => {
    const metadata = encoded([{ id: 'GeyserGeneric_steam', x: 3, y: 4 }]);

    // The mod's reader iterates the dictionary's properties and skips any value
    // whose token type is not String. An object or number here would be gone,
    // silently, after the next in-game save.
    expect(metadata[TERRAIN_METADATA_KEY]).to.be.a('string');
    expect(JSON.parse(metadata[TERRAIN_METADATA_KEY])).to.deep.equal({
      v: TERRAIN_SCHEMA_VERSION,
      features: [{ id: 'GeyserGeneric_steam', x: 3, y: 4 }],
    });
  });

  it('writes the schema version on every payload', () => {
    const payload = JSON.parse(encoded([{ id: 'OilWell', x: 0, y: 0 }])[TERRAIN_METADATA_KEY]);
    expect(payload.v).to.equal(TERRAIN_SCHEMA_VERSION);
  });

  it('deletes our key rather than leaving an empty-feature husk in every file', () => {
    const metadata = encodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: 'stale' }, []);
    expect(metadata).to.equal(undefined);
  });

  it('omits the whole block when nothing is left to write, as the mod does', () => {
    expect(encodeTerrainFeatures(undefined, [])).to.equal(undefined);
    expect(encodeTerrainFeatures({}, [])).to.equal(undefined);
  });

  it('rounds fractional coordinates to whole cells', () => {
    const metadata = encoded([{ id: 'GeyserGeneric_steam', x: 3.4, y: -2.6 }]);
    const payload = JSON.parse(metadata[TERRAIN_METADATA_KEY]);
    expect(payload.features[0]).to.include({ x: 3, y: -3 });
  });
});

describe('Terrain metadata: decoding', function () {
  it('round-trips ids and positions', () => {
    const features = [
      { id: 'GeyserGeneric_chlorine_gas', x: 12, y: 4 },
      { id: 'GeyserGeneric_steam', x: 30, y: -2 },
      { id: 'OilWell', x: 0, y: 7 },
    ];
    expect(decodeTerrainFeatures(encoded(features))).to.deep.equal(features);
  });

  it('treats an absent key as zero features', () => {
    expect(decodeTerrainFeatures(undefined)).to.deep.equal([]);
    expect(decodeTerrainFeatures({})).to.deep.equal([]);
    expect(decodeTerrainFeatures({ 'someone/else': 'value' })).to.deep.equal([]);
  });

  // Acceptance criterion 5: malformed JSON must never block loading a blueprint.
  it('survives malformed JSON with zero features instead of throwing', () => {
    expect(() => decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: '{not json' })).to.not.throw();
    expect(decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: '{not json' })).to.deep.equal([]);
  });

  it('ignores a payload whose shape is wrong rather than guessing', () => {
    const cases = ['"a string"', '[]', '{"v":1}', '{"v":1,"features":{}}', '{"features":[]}'];
    for (const json of cases)
      expect(decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: json }), json).to.deep.equal([]);
  });

  // A range check, not equality: a future v2 reader must still read v1 files.
  // What must never pass is a version that cannot name a real schema.
  it('ignores a payload whose version cannot name a real schema', () => {
    for (const v of [0, -1, 1.5, '1', null, true]) {
      const json = JSON.stringify({ v, features: [{ id: 'OilWell', x: 1, y: 1 }] });
      expect(decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: json }), String(v)).to.deep.equal(
        []
      );
    }
  });

  it('ignores a payload from a newer schema version', () => {
    const future = JSON.stringify({
      v: TERRAIN_SCHEMA_VERSION + 1,
      features: [{ id: 'GeyserGeneric_steam', x: 1, y: 1 }],
    });
    expect(decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: future })).to.deep.equal([]);
  });

  it('drops individual features that carry no usable id or position', () => {
    const json = JSON.stringify({
      v: 1,
      features: [
        { id: 'GeyserGeneric_steam', x: 1, y: 2 },
        { id: '', x: 0, y: 0 },
        { x: 5, y: 5 },
        { id: 'OilWell' },
        null,
        'nope',
      ],
    });
    expect(decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: json })).to.deep.equal([
      { id: 'GeyserGeneric_steam', x: 1, y: 2 },
    ]);
  });

  // An unknown prefab id is data, not corruption: it can be newer than our
  // export, or come from a mod. It survives so the UI can show it raw.
  it('keeps a feature whose id this database does not know', () => {
    const json = JSON.stringify({ v: 1, features: [{ id: 'SomeModdedGeyser', x: 2, y: 3 }] });
    expect(decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: json })).to.deep.equal([
      { id: 'SomeModdedGeyser', x: 2, y: 3 },
    ]);
  });

  it('round-trips unknown per-feature keys so an older client cannot eat newer data', () => {
    const json = JSON.stringify({
      v: 1,
      features: [{ id: 'GeyserGeneric_steam', x: 1, y: 2, rate: '4200', futureField: { a: 1 } }],
    });
    const decoded = decodeTerrainFeatures({ [TERRAIN_METADATA_KEY]: json });
    expect(decoded[0]).to.deep.equal({
      id: 'GeyserGeneric_steam',
      x: 1,
      y: 2,
      rate: '4200',
      futureField: { a: 1 },
    });

    const reencoded = decodeTerrainFeatures(encodeTerrainFeatures({}, decoded));
    expect(reencoded).to.deep.equal(decoded);
  });
});

describe('Terrain metadata: foreign keys', function () {
  it('preserves metadata keys we do not own', () => {
    const metadata = encodeTerrainFeatures(
      { 'someothermod/thing': 'precious', 'blueprintsv2/future': '7' },
      [{ id: 'OilWell', x: 1, y: 1 }]
    );

    expect(metadata!['someothermod/thing']).to.equal('precious');
    expect(metadata!['blueprintsv2/future']).to.equal('7');
  });

  it('keeps foreign keys even when we have no terrain of our own', () => {
    const metadata = encodeTerrainFeatures({ 'someothermod/thing': 'precious' }, []);
    expect(metadata).to.deep.equal({ 'someothermod/thing': 'precious' });
  });
});

describe('Terrain metadata: SanitizePositions mirror', function () {
  it('reports no offset for an already-normalized blueprint', () => {
    const bni: BniBlueprint = {
      friendlyname: 'x',
      buildings: [{ offset: { x: 0, y: 2 } } as any],
      digcommands: [],
    };
    expect(modSanitizeOffset(bni)).to.equal(null);
  });

  it('reports no offset when there is nothing the mod can see', () => {
    expect(modSanitizeOffset({ friendlyname: 'x', buildings: [], digcommands: [] })).to.equal(null);
  });

  it('re-origins to (0,0) as soon as either axis is negative', () => {
    const bni: BniBlueprint = {
      friendlyname: 'x',
      buildings: [{ offset: { x: -3, y: 5 } } as any],
      digcommands: [],
    };
    // The mod shifts by (-minX, -minY) on both axes once it decides to act, so
    // a positive minY moves down. Mirror that, or our export disagrees with it.
    expect(modSanitizeOffset(bni)).to.deep.include({ x: 3, y: -5 });
  });

  it('takes the minimum across digs, notes and plans, not just buildings', () => {
    const bni: BniBlueprint = {
      friendlyname: 'x',
      buildings: [{ offset: { x: 4, y: 4 } } as any],
      digcommands: [{ x: 2, y: 2 }],
      worldNotes: [{ x: -1, y: 6, type: 0 }],
      planningtoolmod_shapecollection: [{ x: 3, y: -7, shape: 0, color: 0 }],
    };
    expect(modSanitizeOffset(bni)).to.deep.include({ x: 1, y: 7 });
  });
});

describe('Blueprint: terrain annotations end to end', function () {
  before(function () {
    loadGameDatabase();
  });

  const features = [
    { id: 'GeyserGeneric_chlorine_gas', x: 12, y: 4 },
    { id: 'GeyserGeneric_steam', x: 30, y: 2 },
    { id: 'OilWell', x: 1, y: 9 },
  ];

  // Acceptance criterion 1.
  it('places three geysers, exports, re-imports — identical ids and positions', () => {
    const authored = new Blueprint();
    authored.terrainFeatures = features.map(f => ({ ...f }));

    const reopened = new Blueprint();
    reopened.importFromBni(authored.toBniBlueprint('geysers'));

    expect(reopened.terrainFeatures).to.deep.equal(features);
  });

  it('carries annotations through the MDB model (save, undo, fork, version restore)', () => {
    const authored = new Blueprint();
    authored.terrainFeatures = features.map(f => ({ ...f }));

    const reopened = new Blueprint();
    reopened.importFromMdb(authored.toMdbBlueprint());
    expect(reopened.terrainFeatures).to.deep.equal(features);

    // clone() goes through the same MDB round trip the undo ring uses.
    expect(authored.clone().terrainFeatures).to.deep.equal(features);
  });

  it('omits the metadata block entirely from a blueprint with no annotations', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb({ blueprintItems: [{ id: 'Tile' }] });
    expect(blueprint.toBniBlueprint('plain').metadata).to.equal(undefined);
    expect(blueprint.toMdbBlueprint().terrainFeatures).to.equal(undefined);
  });

  // Acceptance criterion 2, and the specific case called out in the spec: the
  // mod's SanitizePositions() would re-origin the buildings and leave `metadata`
  // where it was, so we normalize both together before writing.
  it('keeps geysers aligned to a building authored at negative coordinates', () => {
    const authored = new Blueprint();
    authored.importFromMdb({ blueprintItems: [{ id: 'Tile', position: new Vector2(-3, -5) }] });
    authored.terrainFeatures = [{ id: 'GeyserGeneric_steam', x: -3, y: -4 }];

    const exported = authored.toBniBlueprint('negative');

    // Normalized on the way out, so the mod's own pass has nothing left to do.
    expect(modSanitizeOffset(exported)).to.equal(null);
    expect(exported.buildings[0].offset).to.deep.include({ x: 0, y: 0 });

    const reopened = new Blueprint();
    reopened.importFromBni(exported);

    // The geyser sat one cell above the building; it still does.
    const building = reopened.blueprintItems[0];
    const geyser = reopened.terrainFeatures[0];
    expect(geyser.x - building.position.x).to.equal(0);
    expect(geyser.y - building.position.y).to.equal(1);

    // Normalization must happen on the copies being written, never on the open
    // blueprint: exporting is not an edit, and shifting the live model would
    // move the user's blueprint under them every time they hit Download.
    expect(authored.blueprintItems[0].position).to.deep.include({ x: -3, y: -5 });
    expect(authored.terrainFeatures).to.deep.equal([
      { id: 'GeyserGeneric_steam', x: -3, y: -4 },
    ]);
  });

  it('applies the same shift to annotations that the mod would apply to buildings', () => {
    const authored = new Blueprint();
    authored.importFromMdb({ blueprintItems: [{ id: 'Tile', position: new Vector2(-10, -2) }] });
    authored.terrainFeatures = [{ id: 'OilWell', x: 5, y: 5 }];

    const exported = authored.toBniBlueprint('shifted');
    expect(exported.metadata).to.not.equal(undefined);
    expect(decodeTerrainFeatures(exported.metadata)).to.deep.equal([
      { id: 'OilWell', x: 15, y: 7 },
    ]);

    // Same guard as above: the source is untouched, so exporting twice in a row
    // yields the same file rather than compounding the shift.
    expect(authored.blueprintItems[0].position).to.deep.include({ x: -10, y: -2 });
    expect(authored.terrainFeatures).to.deep.equal([{ id: 'OilWell', x: 5, y: 5 }]);
    expect(JSON.stringify(authored.toBniBlueprint('shifted'))).to.equal(
      JSON.stringify(exported)
    );
  });

  // Acceptance criterion 3.
  it('preserves an unrelated metadata key through load and re-save', () => {
    const hand = {
      friendlyname: 'hand-edited',
      buildings: [],
      digcommands: [],
      metadata: { 'someothermod/precious': 'do not touch' },
    };

    const blueprint = new Blueprint();
    blueprint.importFromBni(hand);
    blueprint.terrainFeatures.push({ id: 'GeyserGeneric_steam', x: 2, y: 2 });

    expect(blueprint.toBniBlueprint('hand-edited').metadata!['someothermod/precious']).to.equal(
      'do not touch'
    );
  });

  it('preserves foreign metadata across the server-side MDB round trip too', () => {
    const blueprint = new Blueprint();
    blueprint.importFromBni({
      friendlyname: 'x',
      buildings: [],
      digcommands: [],
      metadata: { 'someothermod/precious': 'do not touch' },
    });

    const reopened = new Blueprint();
    reopened.importFromMdb(blueprint.toMdbBlueprint());

    expect(reopened.toBniBlueprint('x').metadata).to.deep.equal({
      'someothermod/precious': 'do not touch',
    });
  });

  // Acceptance criterion 5, at the Blueprint level.
  it('loads a blueprint whose terrain payload is malformed, minus the geysers', () => {
    const blueprint = new Blueprint();
    expect(() =>
      blueprint.importFromBni({
        friendlyname: 'broken',
        buildings: [],
        digcommands: [],
        metadata: { [TERRAIN_METADATA_KEY]: '{{{' },
      })
    ).to.not.throw();
    expect(blueprint.terrainFeatures).to.deep.equal([]);
  });

  // Acceptance criterion 6: annotations are not construction.
  it('never writes annotations into the buildings array', () => {
    const blueprint = new Blueprint();
    blueprint.importFromMdb({ blueprintItems: [{ id: 'Tile' }] });
    blueprint.terrainFeatures = features.map(f => ({ ...f }));

    const withGeysers = blueprint.toBniBlueprint('with');
    expect(withGeysers.buildings).to.have.length(1);
    expect(withGeysers.buildings.map(b => b.buildingdef)).to.deep.equal(['Tile']);
  });

  it('produces an identical buildings array with and without annotations', () => {
    const plain = new Blueprint();
    plain.importFromMdb({ blueprintItems: [{ id: 'Tile' }, { id: 'Wire' }] });

    const annotated = new Blueprint();
    annotated.importFromMdb({ blueprintItems: [{ id: 'Tile' }, { id: 'Wire' }] });
    annotated.terrainFeatures = features.map(f => ({ ...f }));

    expect(JSON.stringify(annotated.toBniBlueprint('x').buildings)).to.equal(
      JSON.stringify(plain.toBniBlueprint('x').buildings)
    );
  });

  it('frames a geyser-only blueprint on its annotations, footprint included', () => {
    const blueprint = new Blueprint();
    // OilWell is 4x2 in the current export, anchored bottom-left.
    blueprint.terrainFeatures = [{ id: 'OilWell', x: 10, y: 20 }];

    const [topLeft, bottomRight] = blueprint.getBoundingBox();
    expect(topLeft).to.deep.include({ x: 10, y: 20 });
    expect(bottomRight).to.deep.include({ x: 13, y: 21 });
  });
});
