import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('Extract Export Pipeline Tests', () => {
  const assetDb = path.join(__dirname, '../../assets/database');
  const frontendDb = path.join(__dirname, '../../frontend/src/assets/database');
  // The committed runtime artifact is the loose database-2024.json (readable diffs),
  // written into both asset roots. The .zip is a gitignored build derivative the
  // frontend regenerates from this JSON, so tests read the JSON.
  const databaseJsonPath = path.join(assetDb, 'database-2024.json');

  describe('Pipeline Output Files', () => {
    it('should have database-2024.json in assets/database', () => {
      expect(fs.existsSync(databaseJsonPath), `Required file should exist: ${databaseJsonPath}`).to.be.true;
      expect(fs.statSync(databaseJsonPath).size, `File should not be empty: ${databaseJsonPath}`).to.be.greaterThan(0);
    });

    it('should have database-2024.json in frontend/src/assets/database', () => {
      const jsonPath = path.join(frontendDb, 'database-2024.json');
      expect(fs.existsSync(jsonPath), 'Frontend database-2024.json should exist').to.be.true;
      expect(fs.statSync(jsonPath).size).to.be.greaterThan(0);
    });

    it('should have frontend ui_image directory with flat icon PNGs', () => {
      const uiImagePath = path.join(__dirname, '../../frontend/src/assets/ui_image');
      expect(fs.existsSync(uiImagePath), 'Frontend ui_image directory should exist').to.be.true;
      const pngs = fs.readdirSync(uiImagePath).filter(f => f.endsWith('.png'));
      expect(pngs.length, 'Frontend ui_image should have at least 1000 PNGs').to.be.greaterThan(1000);
    });
  });

  describe('Database Content', () => {
    let db: any;

    before(() => {
      db = JSON.parse(fs.readFileSync(databaseJsonPath, 'utf8'));
    });

    it('should have correct record counts', () => {
      expect(db.buildings.length).to.equal(449);
      expect(db.elements.length).to.equal(212);
      expect(db.buildMenuCategories.length).to.equal(15);
      expect(db.buildMenuItems.length).to.equal(365);
    });

    it('should have overlay info sprites in uiSprites', () => {
      const infoSprites = db.uiSprites.filter(
        (s: any) => s.name && (s.name.includes('info') || s.name.includes('tile'))
      );
      expect(infoSprites.length, 'Should have info/tile overlay sprites').to.be.greaterThan(0);
    });

    it('should have empty or small spriteModifiers (overlay only)', () => {
      expect(db.spriteModifiers).to.be.an('array');
      expect(db.spriteModifiers.length, 'spriteModifiers should be small (overlay sprites only)').to.be.lessThan(50);
    });

    it('should have buildings with uiImage field', () => {
      db.buildings.forEach((b: any) => {
        expect(b.uiImage, `Building ${b.prefabId} should have uiImage`).to.be.a('string').with.length.greaterThan(0);
      });
    });

    it('should have processed HTML labels correctly in building names', () => {
      db.buildings.forEach((building: any) => {
        if (building.name) {
          expect(building.name).to.be.a('string');
          if (building.name.includes('<link=')) {
            expect(building.name).to.match(/<link="[^"]+">.*<\/link>/);
          }
        }
      });
    });
  });

  describe('File Size Validation', () => {
    it('should have reasonable uncompressed database size', () => {
      const size = fs.statSync(databaseJsonPath).size;
      expect(size).to.be.greaterThan(1024);
      expect(size).to.be.lessThan(20 * 1024 * 1024);
    });
  });

  describe('Required Directories', () => {
    it('should have required directories', () => {
      const requiredDirs = [
        path.join(__dirname, '../../assets'),
        path.join(__dirname, '../../assets/database'),
        path.join(__dirname, '../../assets/ui_image'),
        path.join(__dirname, '../../frontend/src/assets'),
        path.join(__dirname, '../../frontend/src/assets/database'),
        path.join(__dirname, '../../frontend/src/assets/ui_image'),
      ];

      requiredDirs.forEach(dir => {
        expect(fs.existsSync(dir), `Required directory should exist: ${dir}`).to.be.true;
        expect(fs.statSync(dir).isDirectory(), `Path should be directory: ${dir}`).to.be.true;
      });
    });
  });
});
