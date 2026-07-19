import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  BuildableElement,
  BSpriteInfo,
  BSpriteModifier,
  BBuilding,
} from '../../lib';

describe('Database Asset Validation', () => {
  const assetPath = path.join(__dirname, '../../assets/database');
  // The committed runtime artifact is the loose database-2024.json (readable diffs);
  // the backend reads it directly and the frontend zips it at build time. The .zip is
  // a gitignored build derivative, so tests read the JSON.
  const databaseJsonPath = path.join(assetPath, 'database-2024.json');
  const readDatabase = () => JSON.parse(fs.readFileSync(databaseJsonPath, 'utf8'));
  const uiImagePath = path.join(__dirname, '../../assets/ui_image');

  describe('Core Database Files', () => {
    it('should have valid database structure', () => {
      expect(fs.existsSync(databaseJsonPath), 'database-2024.json should exist').to.be.true;

      const database = readDatabase();

      expect(database).to.have.property('elements');
      expect(database).to.have.property('buildMenuCategories');
      expect(database).to.have.property('buildMenuItems');
      expect(database).to.have.property('uiSprites');
      expect(database).to.have.property('spriteModifiers');
      expect(database).to.have.property('buildings');

      expect(database.elements).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildMenuCategories).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildMenuItems).to.be.an('array').with.length.greaterThan(0);
      expect(database.uiSprites).to.be.an('array').with.length.greaterThan(0);
      expect(database.spriteModifiers).to.be.an('array');
      expect(database.buildings).to.be.an('array').with.length.greaterThan(0);
    });

    it('should write database-2024.json into the frontend asset root', () => {
      const frontendJson = path.join(
        __dirname,
        '../../frontend/src/assets/database/database-2024.json'
      );
      expect(fs.existsSync(frontendJson), 'frontend database-2024.json should exist').to.be.true;
      expect(fs.statSync(frontendJson).size).to.be.greaterThan(0);
    });
  });

  describe('Database Content Validation', () => {
    let database: any;

    before(() => {
      database = readDatabase();
    });

    it('should have 473 buildings and 212 elements', () => {
      // 449 vanilla + 24 modded (6 Steam Workshop mods) — see
      // spec/WEBSITE_MOD_IMPORT.md. Import defensively: this count varies
      // with whatever mods were enabled at export time.
      expect(database.buildings.length).to.equal(473);
      expect(database.elements.length).to.equal(212);
    });

    it('should have valid elements structure', () => {
      database.elements.forEach((element: BuildableElement, index: number) => {
        expect(element, `Element ${index} should have id`).to.have.property('id');
        expect(element.id, `Element ${index} id should be string`)
          .to.be.a('string')
          .with.length.greaterThan(0);
      });
    });

    it('should have valid building structure with uiImage', () => {
      database.buildings.forEach((building: BBuilding, index: number) => {
        expect(building, `Building ${index} should have prefabId`).to.have.property('prefabId');
        expect(building.prefabId, `Building ${index} prefabId should be string`)
          .to.be.a('string')
          .with.length.greaterThan(0);
        expect(building, `Building ${index} should have uiImage`).to.have.property('uiImage');
        expect(building.uiImage, `Building ${index} uiImage should be string`)
          .to.be.a('string')
          .with.length.greaterThan(0);
      });
    });

    it('should preserve representative areas of effect and omit empty arrays', () => {
      const byId = new Map<string, BBuilding>(
        (database.buildings as BBuilding[]).map(building => [building.prefabId, building])
      );
      const expectedKinds = new Map([
        ['FloorLamp', 'light'],
        ['AirFilter', 'elementIntake'],
        ['SolidTransferArm', 'operationRange'],
        ['RadiationLight', 'radiation'],
        ['CometDetector', 'skyScan'],
      ]);
      for (const [prefabId, kind] of expectedKinds) {
        const building = byId.get(prefabId);
        expect(building, `${prefabId} should exist`).not.to.equal(undefined);
        expect(building!.areasOfEffect, `${prefabId} areasOfEffect`).to.be.an('array').that.is.not
          .empty;
        expect(building!.areasOfEffect!.some(effect => effect.kind === kind)).to.equal(true);
      }

      const rawBuildingFile = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../export/database/building.json'), 'utf8')
      );
      const rawFloorLamp = rawBuildingFile.bBuildingDefList.find(
        (building: { name: string }) => building.name === 'FloorLamp'
      );
      expect(byId.get('FloorLamp')!.areasOfEffect).to.deep.equal(rawFloorLamp.areasOfEffect);

      for (const building of database.buildings as BBuilding[])
        expect(
          building.areasOfEffect,
          `${building.prefabId} empty areasOfEffect`
        ).not.to.deep.equal([]);
    });

    it('should have overlay info sprites in uiSprites', () => {
      const infoSprites = (database.uiSprites as BSpriteInfo[]).filter(
        si => si.name && (si.name.includes('info') || si.name.includes('tile'))
      );
      expect(infoSprites.length).to.be.greaterThan(0);
    });

    it('should have overlay spriteModifiers (info / element overlays)', () => {
      expect(database.spriteModifiers).to.be.an('array');
      (database.spriteModifiers as BSpriteModifier[]).forEach((modifier, index) => {
        expect(modifier, `Modifier ${index} should have name`).to.have.property('name');
        expect(modifier, `Modifier ${index} should have tags`).to.have.property('tags');
        expect(modifier.tags, `Modifier ${index} tags should be array`).to.be.an('array');
      });
    });
  });

  describe('Flat Icon Assets', () => {
    it('should have ui_image directory with PNG files', () => {
      expect(fs.existsSync(uiImagePath), 'assets/ui_image should exist').to.be.true;
      const pngs = fs.readdirSync(uiImagePath).filter(f => f.endsWith('.png'));
      expect(pngs.length, 'ui_image should have at least 1000 PNG files').to.be.greaterThan(1000);
    });

    it('should have a ui_image PNG for every building', () => {
      const database = readDatabase();
      const missingIcons: string[] = [];
      for (const building of database.buildings) {
        const expectedPng = path.join(uiImagePath, `${building.uiImage}.png`);
        if (!fs.existsSync(expectedPng)) {
          missingIcons.push(building.uiImage);
        }
      }
      expect(missingIcons, `Missing icons: ${missingIcons.join(', ')}`).to.be.empty;
    });
  });
});
