import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { BExport, BuildableElement, BuildMenuCategory, BuildMenuItem, BSpriteInfo, BSpriteModifier, BBuilding } from '../../lib';

describe('Database Asset Validation', () => {
  const assetPath = path.join(__dirname, '../../assets/database');
  
  describe('Core Database Files', () => {
    it('should have valid database.json structure', () => {
      const databasePath = path.join(assetPath, 'database.json');
      expect(fs.existsSync(databasePath), 'database.json should exist').to.be.true;
      
      const data = fs.readFileSync(databasePath, 'utf-8');
      const database: BExport = JSON.parse(data);
      
      // Validate core structure
      expect(database).to.have.property('elements');
      expect(database).to.have.property('buildMenuCategories');
      expect(database).to.have.property('buildMenuItems');
      expect(database).to.have.property('uiSprites');
      expect(database).to.have.property('spriteModifiers');
      expect(database).to.have.property('buildings');
      
      // Validate arrays are populated
      expect(database.elements).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildMenuCategories).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildMenuItems).to.be.an('array').with.length.greaterThan(0);
      expect(database.uiSprites).to.be.an('array').with.length.greaterThan(0);
      expect(database.spriteModifiers).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildings).to.be.an('array').with.length.greaterThan(0);
    });

    it('should have valid database-groups.json structure', () => {
      const groupsPath = path.join(assetPath, 'database-groups.json');
      expect(fs.existsSync(groupsPath), 'database-groups.json should exist').to.be.true;
      
      const data = fs.readFileSync(groupsPath, 'utf-8');
      const database: BExport = JSON.parse(data);
      
      // Should have same basic structure as main database
      expect(database).to.have.property('elements');
      expect(database).to.have.property('buildings');
      expect(database).to.have.property('spriteModifiers');
      expect(database).to.have.property('uiSprites');
    });

    it('should have valid database-white.json structure', () => {
      const whitePath = path.join(assetPath, 'database-white.json');
      expect(fs.existsSync(whitePath), 'database-white.json should exist').to.be.true;
      
      const data = fs.readFileSync(whitePath, 'utf-8');
      const database: BExport = JSON.parse(data);
      
      // Should have same basic structure plus white variants
      expect(database).to.have.property('spriteModifiers');
      expect(database).to.have.property('uiSprites');
      
      // Check for white variants
      const whiteModifiers = database.spriteModifiers.filter(sm => sm.name && sm.name.includes('_white'));
      expect(whiteModifiers.length).to.be.greaterThan(0);
      
      const whiteSprites = database.uiSprites.filter(si => si.name && si.name.includes('_white'));
      expect(whiteSprites.length).to.be.greaterThan(0);
    });

    it('should have valid database-repack.json structure', () => {
      const repackPath = path.join(assetPath, 'database-repack.json');
      expect(fs.existsSync(repackPath), 'database-repack.json should exist').to.be.true;
      
      const data = fs.readFileSync(repackPath, 'utf-8');
      const database: BExport = JSON.parse(data);
      
      // Should have repacked texture references
      expect(database).to.have.property('uiSprites');
      
      // Check for repack texture names
      const repackSprites = database.uiSprites.filter(si => si.textureName?.startsWith('repack_'));
      expect(repackSprites.length).to.be.greaterThan(0);
    });
  });

  describe('Database Content Validation', () => {
    let database: BExport;
    
    before(() => {
      const databasePath = path.join(assetPath, 'database.json');
      const data = fs.readFileSync(databasePath, 'utf-8');
      database = JSON.parse(data);
    });

    it('should have valid elements structure', () => {
      database.elements.forEach((element: BuildableElement, index: number) => {
        expect(element, `Element ${index} should have id`).to.have.property('id');
        expect(element.id, `Element ${index} id should be string`).to.be.a('string').with.length.greaterThan(0);
      });
    });

    it('should have valid building structure', () => {
      database.buildings.forEach((building: BBuilding, index: number) => {
        expect(building, `Building ${index} should have prefabId`).to.have.property('prefabId');
        expect(building.prefabId, `Building ${index} prefabId should be string`).to.be.a('string').with.length.greaterThan(0);
        expect(building, `Building ${index} should have sprites`).to.have.property('sprites');
        expect(building.sprites, `Building ${index} should have spriteNames`).to.have.property('spriteNames');
        expect(building.sprites.spriteNames, `Building ${index} spriteNames should be array`).to.be.an('array');
      });
    });

    it('should have valid sprite modifier structure', () => {
      database.spriteModifiers.forEach((modifier: BSpriteModifier, index: number) => {
        expect(modifier, `Modifier ${index} should have name`).to.have.property('name');
        if (modifier.name !== null) {
          expect(modifier.name, `Modifier ${index} name should be string if not null`).to.be.a('string').with.length.greaterThan(0);
        }
        expect(modifier, `Modifier ${index} should have spriteInfoName`).to.have.property('spriteInfoName');
        if (modifier.spriteInfoName !== null) {
          expect(modifier.spriteInfoName, `Modifier ${index} spriteInfoName should be string if not null`).to.be.a('string').with.length.greaterThan(0);
        }
        expect(modifier, `Modifier ${index} should have tags`).to.have.property('tags');
        expect(modifier.tags, `Modifier ${index} tags should be array`).to.be.an('array');
      });
    });

    it('should have valid sprite info structure', () => {
      database.uiSprites.forEach((sprite: BSpriteInfo, index: number) => {
        expect(sprite, `Sprite ${index} should have name`).to.have.property('name');
        expect(sprite.name, `Sprite ${index} name should be string`).to.be.a('string').with.length.greaterThan(0);
        expect(sprite, `Sprite ${index} should have textureName`).to.have.property('textureName');
        expect(sprite.textureName, `Sprite ${index} textureName should be string`).to.be.a('string').with.length.greaterThan(0);
      });
    });
  });

  describe('Data Consistency', () => {
    let database: BExport;
    
    before(() => {
      const databasePath = path.join(assetPath, 'database.json');
      const data = fs.readFileSync(databasePath, 'utf-8');
      database = JSON.parse(data);
    });

    it('should have sprite modifiers that reference valid sprite infos', () => {
      const spriteInfoNames = new Set(database.uiSprites.map(si => si.name));
      
      database.spriteModifiers.forEach((modifier: BSpriteModifier) => {
        expect(spriteInfoNames.has(modifier.spriteInfoName), 
          `Sprite modifier "${modifier.name}" references non-existent sprite info "${modifier.spriteInfoName}"`
        ).to.be.true;
      });
    });

    it('should have buildings that reference valid sprite modifiers', () => {
      const spriteModifierNames = new Set(database.spriteModifiers.map(sm => sm.name));
      
      database.buildings.forEach((building: BBuilding) => {
        building.sprites.spriteNames.forEach((spriteName: string) => {
          expect(spriteModifierNames.has(spriteName), 
            `Building "${building.prefabId}" references non-existent sprite modifier "${spriteName}"`
          ).to.be.true;
        });
      });
    });
  });
});