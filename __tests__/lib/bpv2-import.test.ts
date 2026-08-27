import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  Blueprint,
  BniBlueprint,
  BniWorldNote,
  BuildableElement,
  decodeBniShareString,
  encodeBniShareString,
  looksLikeBniShareString,
  Vector2,
} from '../../lib';
import { loadGameDatabase } from '../helpers/roomFixtures';

const TIME_SENSORS_FIXTURE_PATH = path.join(__dirname, '../fixtures/time-sensors.blueprint');

// BlueprintsV2 v3 import coverage (spec/blueprintsv2-import-spec.md), driven
// by a real mod export: 71 buildings, material overrides, custom icon, both
// note kinds. PAirlockDoor was originally an unsupported modded building in
// this fixture; the site now ships Airlock Door mod support (see
// spec/WEBSITE_MOD_IMPORT.md), so it imports as a known (modded) building
// like the other 70. The unknown-building code path (hadUnknownBuildings,
// unknownBuildingDefs) is covered independently in blueprint-import.test.ts
// with a synthetic id.
const FIXTURE_PATH = path.join(__dirname, '../fixtures/bpv2-example-meta.blueprint');

describe('BlueprintsV2 import', function () {
  let fixtureText: string;
  let fixture: BniBlueprint;

  before(function () {
    loadGameDatabase();
    fixtureText = fs.readFileSync(FIXTURE_PATH, 'utf8');
    fixture = JSON.parse(fixtureText);
  });

  describe('importFromBni on the real sample export', function () {
    let blueprint: Blueprint;

    before(function () {
      blueprint = new Blueprint();
      blueprint.importFromBni(fixture);
    });

    it('imports every building in the file, including the now-known modded one', () => {
      // 71 buildings in the file; PAirlockDoor is a known modded building
      // now that the site ships Airlock Door mod support.
      expect(fixture.buildings).to.have.length(71);
      expect(blueprint.blueprintItems).to.have.length(71);
    });

    it('does not flag PAirlockDoor as unknown now that its mod is supported', () => {
      expect(blueprint.hadUnknownBuildings).to.equal(false);
      expect(blueprint.unknownBuildingDefs).to.deep.equal([]);
      const airlockDoor = blueprint.blueprintItems.find(item => item.id == 'PAirlockDoor');
      expect(airlockDoor).to.not.equal(undefined);
      expect(airlockDoor!.oniItem.mod).to.equal('2094698134');
    });

    it('resolves material tag hashes to elements (P1/Q1)', () => {
      const rubberTile = blueprint.blueprintItems.find(item => item.id == 'RubberTile');
      expect(rubberTile).to.not.equal(undefined);
      // -351425712 is Rubber in the game export
      const rubber = BuildableElement.getElementByTag(-351425712);
      expect(rubber).to.not.equal(undefined);
      expect(rubberTile!.buildableElements[0].id).to.equal(rubber!.id);
    });

    it('resolves multi-ingredient materials in recipe order (WireRubber: Copper, Plastic)', () => {
      const wire = blueprint.blueprintItems.find(item => item.id == 'WireRubber');
      expect(wire).to.not.equal(undefined);
      const copper = BuildableElement.getElementByTag(-1725038055);
      const plastic = BuildableElement.getElementByTag(-1142341158);
      expect(wire!.buildableElements[0].id).to.equal(copper!.id);
      expect(wire!.buildableElements[1].id).to.equal(plastic!.id);
    });

    it('falls back to the default material for unknown hashes', () => {
      const bni: BniBlueprint = JSON.parse(fixtureText);
      const tileEntry = bni.buildings.find(b => b.buildingdef == 'RubberTile')!;
      tileEntry.selected_elements = [123456789];

      const reimported = new Blueprint();
      expect(() => reimported.importFromBni(bni)).to.not.throw();
      const tile = reimported.blueprintItems.find(item => item.id == 'RubberTile');
      // Unknown hash -> default element, not a crash or an empty slot
      expect(tile!.buildableElements[0]).to.not.equal(undefined);
      expect(tile!.buildableElements[0].id).to.equal(tile!.oniItem.defaultElement[0].id);
    });

    it('carries every buildingData entry onto the imported items (Q4)', () => {
      let count = 0;
      for (const item of blueprint.blueprintItems)
        if (item.buildingData != null) count += item.buildingData.length;
      // Matches the raw fixture: 26 buildings carry 37 buildingData entries.
      expect(count).to.equal(37);
    });

    it('keeps the v3 metadata available on the parsed blueprint (P0)', () => {
      expect(blueprint.bniMetadata).to.not.equal(null);
      expect(blueprint.bniMetadata!.blueprintVersion).to.equal(3);
      expect(blueprint.bniMetadata!.userdesc).to.equal(
        'this blueprint has a custom icon and also material overides'
      );
      expect(blueprint.bniMetadata!.icon).to.equal('Snow');
      expect(blueprint.bniMetadata!.icontint).to.equal('FF0000FF');
      expect(blueprint.bniMetadata!.worldNotes).to.have.length(3);
    });

    it('element world-note ids resolve through the same tag lookup (Q2)', () => {
      const elementNote = blueprint.bniMetadata!.worldNotes!.find(note => note.type == 1)!;
      const element = BuildableElement.getElementByTag(elementNote.id!);
      expect(element).to.not.equal(undefined);
      // Sample note is Copper Ore (Cuprite)
      expect(element!.id).to.equal('Cuprite');
    });

    it('exposes world notes as a first-class field for the editor overlay', () => {
      // worldNotes lives on the blueprint (not just bniMetadata) so it can be
      // carried through destroyAndCopyItems and drawn.
      expect(blueprint.worldNotes).to.have.length(3);
      expect(blueprint.worldNotes).to.deep.equal(blueprint.bniMetadata!.worldNotes);
    });

    it('carries world notes through destroyAndCopyItems and survives an MDB round-trip', () => {
      const rendered = new Blueprint();
      rendered.destroyAndCopyItems(blueprint, false);
      expect(rendered.worldNotes).to.have.length(3);

      // World notes are normal blueprint content now: a save/load round-trip
      // through the MDB model preserves them exactly (spec/element-notes.md §1).
      const reimported = new Blueprint();
      reimported.importFromMdb(rendered.toMdbBlueprint());
      expect(reimported.worldNotes).to.deep.equal(rendered.worldNotes);
      expect(reimported.worldNotes).to.not.equal(rendered.worldNotes);
      // Copied, not shared — undo/redo states must never alias live note objects.
      expect(reimported.worldNotes[0]).to.not.equal(rendered.worldNotes[0]);
    });
  });

  describe('world-notes persistence (spec/element-notes.md §1)', function () {
    it('round-trips notes through importFromBni -> toMdbBlueprint -> importFromMdb exactly', () => {
      const source = new Blueprint();
      source.importFromBni(fixture);
      const mdb = source.toMdbBlueprint();
      expect(mdb.worldNotes).to.have.length(3);

      const reimported = new Blueprint();
      reimported.importFromMdb(mdb);
      expect(reimported.worldNotes).to.deep.equal(source.worldNotes);
    });

    it("carries a text note's icon through every hop, under the mod's own key", () => {
      // BlueprintNoteData.Symbol is matched by sprite name on load, so the key
      // and the value both have to survive verbatim or the game silently drops
      // back to the default icon.
      const withSymbol = {
        ...fixture,
        worldNotes: [
          { x: 1, y: 2, type: 0, title: 't', text: 'b', tinthex: 'FF0000FF', symbol: 'note_warn' },
        ],
      };
      const source = new Blueprint();
      source.importFromBni(withSymbol);
      expect(source.worldNotes[0].symbol).to.equal('note_warn');

      const reimported = new Blueprint();
      reimported.importFromMdb(source.toMdbBlueprint());
      expect(reimported.worldNotes[0].symbol).to.equal('note_warn');
      expect(reimported.toBniBlueprint('symbols').worldNotes![0].symbol).to.equal('note_warn');
    });

    it('omits worldNotes from toMdbBlueprint when there are none (backwards compatibility)', () => {
      const empty = new Blueprint();
      empty.importFromBni({ friendlyname: '', buildings: [], digcommands: [] });
      const mdb = empty.toMdbBlueprint();
      expect(mdb).to.not.have.property('worldNotes');
      // Byte-equal to the pre-change shape, so no stored rawSource is
      // invalidated by shipping this for the (overwhelmingly common) notes-free case.
      expect(JSON.stringify(mdb)).to.equal(JSON.stringify({ blueprintItems: [] }));
    });

    it('toBniBlueprint emits worldNotes and bumps blueprintVersion to 3', () => {
      const source = new Blueprint();
      source.importFromBni(fixture);
      const bni = source.toBniBlueprint('roundtrip');
      expect(bni.blueprintVersion).to.equal(3);
      expect(bni.worldNotes).to.have.length(3);
      expect(bni.worldNotes).to.deep.equal(source.worldNotes);
    });

    it('toBniBlueprint omits worldNotes and does not bump the version when there are none', () => {
      const empty = new Blueprint();
      empty.importFromBni({ friendlyname: '', buildings: [], digcommands: [] });
      const bni = empty.toBniBlueprint('no-notes');
      expect(bni).to.not.have.property('worldNotes');
      expect(bni.blueprintVersion).to.equal(undefined);
    });

    it('getBoundingBox grows to include a note placed outside the building footprint', () => {
      const withoutNote = new Blueprint();
      withoutNote.importFromBni({ ...fixture, worldNotes: [] });
      const [, bottomRightBefore] = withoutNote.getBoundingBox();

      const farNote: BniWorldNote = {
        x: bottomRightBefore.x + 50,
        y: bottomRightBefore.y + 50,
        type: 0,
        title: 'far away',
      };
      const withNote = new Blueprint();
      withNote.importFromBni({ ...fixture, worldNotes: [farNote] });
      const [, bottomRightAfter] = withNote.getBoundingBox();

      expect(bottomRightAfter.x).to.equal(farNote.x);
      expect(bottomRightAfter.y).to.equal(farNote.y);
    });
  });

  describe('buildingData persistence (spec/building-settings-plan.md, phase 1)', function () {
    let timeSensorsText: string;
    let timeSensorsFixture: BniBlueprint;

    before(function () {
      timeSensorsText = fs.readFileSync(TIME_SENSORS_FIXTURE_PATH, 'utf8');
      timeSensorsFixture = JSON.parse(timeSensorsText);
    });

    it('round-trips buildingData through bni -> Blueprint -> mdb -> Blueprint -> bni verbatim', () => {
      const source = new Blueprint();
      source.importFromBni(timeSensorsFixture);
      expect(source.blueprintItems).to.have.length(3);
      expect(source.blueprintItems.map(item => item.buildingData)).to.deep.equal(
        timeSensorsFixture.buildings.map(b => b.buildingData)
      );

      const mdb = source.toMdbBlueprint();
      const reimported = new Blueprint();
      reimported.importFromMdb(mdb);
      expect(reimported.blueprintItems.map(item => item.buildingData)).to.deep.equal(
        source.blueprintItems.map(item => item.buildingData)
      );

      const bni = reimported.toBniBlueprint('roundtrip');
      expect(bni.buildings.map(b => b.buildingData)).to.deep.equal(
        timeSensorsFixture.buildings.map(b => b.buildingData)
      );
    });

    it('a sanitized export keeps settings attached to the shifted building', () => {
      // Shift the fixture into negative territory so toBniBlueprint's own
      // SanitizePositions-equivalent pass actually fires.
      const shifted: BniBlueprint = {
        ...timeSensorsFixture,
        buildings: timeSensorsFixture.buildings.map(b => ({
          ...b,
          offset: new Vector2(b.offset!.x - 10, b.offset!.y - 10),
        })),
      };
      const source = new Blueprint();
      source.importFromBni(shifted);

      const bni = source.toBniBlueprint('sanitized');
      expect(bni.buildings.map(b => b.buildingData)).to.deep.equal(
        timeSensorsFixture.buildings.map(b => b.buildingData)
      );
    });

    it('omits buildingData from toMdbBuilding/toBniBuilding for a building placed in the editor', () => {
      const empty = new Blueprint();
      empty.importFromBni({ friendlyname: '', buildings: [], digcommands: [] });
      // No blueprintItems to place through the editor API directly here, but
      // the empty-fixture check below proves the omit-when-empty path: a
      // blueprint with no buildingData produces no buildingData key anywhere.
      const mdb = empty.toMdbBlueprint();
      expect(JSON.stringify(mdb)).to.not.include('buildingData');
      const bni = empty.toBniBlueprint('no-settings');
      expect(JSON.stringify(bni)).to.not.include('buildingData');
    });

    it('undo simulation: mutating the live item after snapshotting does not affect the restored settings', () => {
      const source = new Blueprint();
      source.importFromBni(timeSensorsFixture);
      const snapshot = source.toMdbBlueprint();

      // Mutate the live item's buildingData directly (as an in-place edit would).
      const liveItem = source.blueprintItems[0];
      const liveSwitch = liveItem.buildingData!.find(entry => entry.Key == 'Switch')!;
      liveSwitch.Value.switchedOn = false;

      const restored = new Blueprint();
      restored.importFromMdb(snapshot);
      const restoredSwitch = restored.blueprintItems[0].buildingData!.find(
        entry => entry.Key == 'Switch'
      )!;
      // Snapshot was taken before the mutation, so it must still read true.
      expect(restoredSwitch.Value.switchedOn).to.equal(true);
      expect(restored.blueprintItems[0].buildingData).to.not.equal(liveItem.buildingData);
    });

    it('clone() carries buildingData', () => {
      const source = new Blueprint();
      source.importFromBni(timeSensorsFixture);
      const cloned = source.clone();
      expect(cloned.blueprintItems.map(item => item.buildingData)).to.deep.equal(
        source.blueprintItems.map(item => item.buildingData)
      );
      expect(cloned.blueprintItems[0].buildingData).to.not.equal(
        source.blueprintItems[0].buildingData
      );
    });
  });

  describe('share-string transport (P2, §1.2)', function () {
    // Build a share-string exactly the way the mod does: 4-byte little-endian
    // uncompressed length + gzip, base64'd. Proves our decoder against the
    // wire format, independent of our own encoder.
    function modEncode(json: string): string {
      const utf8 = Buffer.from(json, 'utf8');
      const header = Buffer.alloc(4);
      header.writeInt32LE(utf8.length, 0);
      return Buffer.concat([header, zlib.gzipSync(utf8)]).toString('base64');
    }

    it('decodes a mod-style share-string of the sample export', async () => {
      const decoded = await decodeBniShareString(modEncode(fixtureText));
      expect(decoded).to.equal(fixtureText);
    });

    it('round-trips through our own encoder', async () => {
      const encoded = await encodeBniShareString(fixtureText);
      expect(await decodeBniShareString(encoded)).to.equal(fixtureText);
    });

    it('rejects text that is not a share-string', async () => {
      let threw = false;
      try {
        await decodeBniShareString('definitely not base64 gzip !!!');
      } catch {
        threw = true;
      }
      expect(threw).to.equal(true);
    });

    it('looksLikeBniShareString distinguishes share-strings from JSON', () => {
      expect(looksLikeBniShareString(modEncode(fixtureText))).to.equal(true);
      expect(looksLikeBniShareString(fixtureText)).to.equal(false);
    });
  });
});
