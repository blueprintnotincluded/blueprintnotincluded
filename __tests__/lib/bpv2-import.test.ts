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
// by a real mod export: 70 buildings, material overrides, custom icon, both
// note kinds, and one modded building (PAirlockDoor) we don't know.
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

    it('imports every known building and skips only the modded one', () => {
      // 71 buildings in the file, exactly 1 (the modded PAirlockDoor) unknown
      expect(fixture.buildings).to.have.length(71);
      expect(blueprint.blueprintItems).to.have.length(70);
    });

    it('collects the unknown building defs (Q8) instead of dropping silently', () => {
      expect(blueprint.hadUnknownBuildings).to.equal(true);
      expect(blueprint.unknownBuildingDefs).to.deep.equal(['PAirlockDoor']);
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
