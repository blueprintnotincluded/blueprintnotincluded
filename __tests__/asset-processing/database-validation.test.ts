import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import {
  BuildableElement,
  BSpriteInfo,
  BSpriteModifier,
  BBuilding,
} from '../../lib';

describe('Database Asset Validation', () => {
  const assetPath = path.join(__dirname, '../../assets/database');
  // The committed runtime artifact is the zip (entry "database.json"); the loose
  // database-2024.json is a gitignored dev output, so tests read from the zip.
  const databaseZipPath = path.join(assetPath, 'database-2024.zip');
  const readDatabase = () => JSON.parse(new AdmZip(databaseZipPath).readAsText('database.json'));
  const uiImagePath = path.join(__dirname, '../../assets/ui_image');

  describe('Core Database Files', () => {
    it('should have valid database structure', () => {
      expect(fs.existsSync(databaseZipPath), 'database-2024.zip should exist').to.be.true;

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

    it('should have database-2024.zip for the frontend', () => {
      const zipPath = path.join(assetPath, 'database-2024.zip');
      expect(fs.existsSync(zipPath), 'database-2024.zip should exist').to.be.true;
      expect(fs.statSync(zipPath).size).to.be.greaterThan(0);
    });
  });

  describe('Database Content Validation', () => {
    let database: any;

    before(() => {
      database = readDatabase();
    });

    it('should have 449 buildings and 212 elements', () => {
      expect(database.buildings.length).to.equal(449);
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
