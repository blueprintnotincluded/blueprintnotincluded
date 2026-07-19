import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  Blueprint,
  BniBlueprint,
  BuildableElement,
  decodeBniShareString,
  encodeBniShareString,
  looksLikeBniShareString,
} from '../../lib';
import { loadGameDatabase } from '../helpers/roomFixtures';

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

    it('carries world notes through destroyAndCopyItems and drops them on an MDB reimport', () => {
      const rendered = new Blueprint();
      rendered.destroyAndCopyItems(blueprint, false);
      expect(rendered.worldNotes).to.have.length(3);

      // Round-tripping through the MDB model (a normal save/load) has no notes.
      const reimported = new Blueprint();
      reimported.importFromMdb(rendered.toMdbBlueprint());
      expect(reimported.worldNotes).to.have.length(0);
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
