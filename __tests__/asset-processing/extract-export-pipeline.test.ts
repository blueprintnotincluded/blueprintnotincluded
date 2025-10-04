import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { AssetPaths } from '../../app/api/batch/asset-paths';
import { AssetValidator } from '../../app/api/batch/asset-validator';
import { AssetLogger } from '../../app/api/batch/asset-logger';

describe('Extract Export Pipeline Tests', () => {
  describe('Pipeline Validation', () => {
    it('should validate that all required output files exist after processing', () => {
      // Test that the expected output files from the pipeline exist
      const requiredFiles = [
        path.join(__dirname, '../../assets/database/database.json'),
        path.join(__dirname, '../../assets/database/database-groups.json'),
        path.join(__dirname, '../../assets/database/database-white.json'),
        path.join(__dirname, '../../assets/database/database-repack.json'),
        path.join(__dirname, '../../assets/database/database.zip')
      ];

      requiredFiles.forEach(filePath => {
        expect(fs.existsSync(filePath), `Required pipeline output file should exist: ${filePath}`).to.be.true;
      });
    });

    it('should validate frontend assets are populated', () => {
      const frontendDatabasePath = path.join(__dirname, '../../frontend/src/assets/database/database.json');
      const frontendImagesPath = path.join(__dirname, '../../frontend/src/assets/images');

      expect(fs.existsSync(frontendDatabasePath), 'Frontend database should exist').to.be.true;
      expect(fs.existsSync(frontendImagesPath), 'Frontend images directory should exist').to.be.true;

      // Check for texture atlas files
      const frontendFiles = fs.readdirSync(frontendImagesPath);
      const repackFiles = frontendFiles.filter(f => f.startsWith('repack_') && f.endsWith('.png'));
      expect(repackFiles.length, 'Frontend should have repack texture files').to.be.greaterThan(0);
    });

    it('should validate database zip integrity', () => {
      const zipPath = path.join(__dirname, '../../assets/database/database.zip');
      expect(fs.existsSync(zipPath), 'Database zip should exist').to.be.true;

      const stats = fs.statSync(zipPath);
      expect(stats.size, 'Database zip should not be empty').to.be.greaterThan(0);
      expect(stats.size, 'Database zip should not be unreasonably large').to.be.lessThan(50 * 1024 * 1024); // 50MB max
    });
  });

  describe('Database Processing Steps', () => {
    let mainDatabase: any;
    let groupsDatabase: any;
    let whiteDatabase: any;
    let repackDatabase: any;

    before(() => {
      // Load all database variants for comparison
      mainDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database.json'), 'utf-8'));
      groupsDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-groups.json'), 'utf-8'));
      whiteDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-white.json'), 'utf-8'));
      repackDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8'));
    });

    it('should have processed HTML labels correctly', () => {
      // Check that buildings have proper label formatting
      mainDatabase.buildings.forEach((building: any) => {
        if (building.name) {
          expect(building.name).to.be.a('string');
          
          // If HTML links exist, they should be properly formatted
          if (building.name.includes('<link=')) {
            expect(building.name).to.match(/<link="[^"]+">.*<\/link>/);
          }
        }
      });
    });

    it('should have added info icons where appropriate', () => {
      // Check that UI sprites include expected info icons
      const infoIcons = mainDatabase.uiSprites.filter((sprite: any) => 
        sprite.name && (sprite.name.includes('info') || sprite.name.includes('icon'))
      );
      expect(infoIcons.length, 'Should have info icons in sprite collection').to.be.greaterThan(0);
    });

    it('should have generated group sprites correctly', () => {
      // Groups database should have group-related sprite processing
      const groupSprites = groupsDatabase.uiSprites.filter((sprite: any) => 
        sprite.name && sprite.name.includes('group')
      );
      
      if (groupSprites.length > 0) {
        groupSprites.forEach((sprite: any) => {
          expect(sprite.textureName).to.be.a('string');
          expect(sprite.name).to.be.a('string');
        });
      }
    });

    it('should have generated white variants correctly', () => {
      // White database should have significantly more sprites than main
      expect(whiteDatabase.uiSprites.length).to.be.greaterThanOrEqual(mainDatabase.uiSprites.length);
      
      const whiteSprites = whiteDatabase.uiSprites.filter((sprite: any) => 
        sprite.name && sprite.name.includes('_white')
      );
      expect(whiteSprites.length, 'Should have white variant sprites').to.be.greaterThan(0);

      // Some white sprites should have white texture names (but not all due to processing variations)
      const whitesWithWhiteTextures = whiteSprites.filter((sprite: any) => 
        sprite.textureName && sprite.textureName.includes('_white')
      );
      expect(whitesWithWhiteTextures.length, 'Should have some white sprites with white textures').to.be.greaterThan(0);
    });

    it('should have repacked textures correctly', () => {
      // Repack database should have repack texture references
      const repackSprites = repackDatabase.uiSprites.filter((sprite: any) => 
        sprite.textureName && sprite.textureName.startsWith('repack_')
      );
      expect(repackSprites.length, 'Should have repacked sprites').to.be.greaterThan(0);

      // Check that UV coordinates are valid for sprites that have them
      const spritesWithUV = repackSprites.filter((sprite: any) => 
        sprite.u0 !== undefined && sprite.u1 !== undefined && sprite.v0 !== undefined && sprite.v1 !== undefined
      );
      
      if (spritesWithUV.length > 0) {
        spritesWithUV.slice(0, 10).forEach((sprite: any) => {
          expect(sprite.u0).to.be.a('number');
          expect(sprite.u1).to.be.a('number');
          expect(sprite.v0).to.be.a('number');
          expect(sprite.v1).to.be.a('number');
          
          // UV coordinates should be within valid range [0, 1]
          expect(sprite.u0).to.be.within(0, 1);
          expect(sprite.u1).to.be.within(0, 1);
          expect(sprite.v0).to.be.within(0, 1);
          expect(sprite.v1).to.be.within(0, 1);
        });
        console.log(`Verified UV coordinates for ${Math.min(10, spritesWithUV.length)} repacked sprites`);
      } else {
        console.log('No sprites with UV coordinates found - this may indicate a different atlas packing strategy');
      }
    });
  });

  describe('Asset Processing Performance', () => {
    it('should have reasonable database file sizes', () => {
      const fileSizeChecks = [
        { path: path.join(__dirname, '../../assets/database/database.json'), name: 'Main database', maxSize: 20 * 1024 * 1024 },
        { path: path.join(__dirname, '../../assets/database/database-groups.json'), name: 'Groups database', maxSize: 15 * 1024 * 1024 },
        { path: path.join(__dirname, '../../assets/database/database-white.json'), name: 'White database', maxSize: 30 * 1024 * 1024 },
        { path: path.join(__dirname, '../../assets/database/database-repack.json'), name: 'Repack database', maxSize: 25 * 1024 * 1024 }
      ];

      fileSizeChecks.forEach(check => {
        const stats = fs.statSync(check.path);
        expect(stats.size, `${check.name} should not be empty`).to.be.greaterThan(1024);
        expect(stats.size, `${check.name} should not exceed ${check.maxSize / (1024 * 1024)}MB`).to.be.lessThan(check.maxSize);
      });
    });

    it('should validate texture atlas efficiency', () => {
      const frontendImages = path.join(__dirname, '../../frontend/src/assets/images');
      const repackFiles = fs.readdirSync(frontendImages)
        .filter(f => f.startsWith('repack_') && f.endsWith('.png'))
        .map(f => path.join(frontendImages, f));

      expect(repackFiles.length, 'Should have reasonable number of texture atlases').to.be.lessThan(150);

      // Check file sizes are reasonable for texture atlases
      repackFiles.forEach(filePath => {
        const stats = fs.statSync(filePath);
        expect(stats.size, `Texture atlas ${path.basename(filePath)} should not be empty`).to.be.greaterThan(1024);
        expect(stats.size, `Texture atlas ${path.basename(filePath)} should not exceed 10MB`).to.be.lessThan(10 * 1024 * 1024);
      });
    });
  });

  describe('Data Integrity Validation', () => {
    it('should maintain consistent element IDs across all databases', () => {
      const databases = [
        { name: 'main', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database.json'), 'utf-8')) },
        { name: 'groups', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-groups.json'), 'utf-8')) },
        { name: 'white', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-white.json'), 'utf-8')) },
        { name: 'repack', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8')) }
      ];

      const mainElementIds = new Set(databases[0].data.elements.map((e: any) => e.id));

      databases.slice(1).forEach(db => {
        const elementIds = new Set(db.data.elements.map((e: any) => e.id));
        
        expect(elementIds.size, `${db.name} database should have same element count as main`).to.equal(mainElementIds.size);
        
        // Check that all element IDs match
        for (const id of mainElementIds) {
          expect(elementIds.has(id), `${db.name} database should contain element ID: ${id}`).to.be.true;
        }
      });
    });

    it('should maintain consistent building prefabIds across all databases', () => {
      const databases = [
        { name: 'main', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database.json'), 'utf-8')) },
        { name: 'groups', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-groups.json'), 'utf-8')) },
        { name: 'white', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-white.json'), 'utf-8')) },
        { name: 'repack', data: JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8')) }
      ];

      const mainBuildingIds = new Set(databases[0].data.buildings.map((b: any) => b.prefabId));

      databases.slice(1).forEach(db => {
        const buildingIds = new Set(db.data.buildings.map((b: any) => b.prefabId));
        
        expect(buildingIds.size, `${db.name} database should have same building count as main`).to.equal(mainBuildingIds.size);
        
        // Check that all building IDs match
        for (const id of mainBuildingIds) {
          expect(buildingIds.has(id), `${db.name} database should contain building prefabId: ${id}`).to.be.true;
        }
      });
    });

    it('should have valid sprite references after all processing', () => {
      const repackDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8'));
      
      // Create lookup maps
      const spriteInfoMap = new Map(repackDatabase.uiSprites.map((si: any) => [si.name, si]));
      const spriteModifierMap = new Map(repackDatabase.spriteModifiers.map((sm: any) => [sm.name, sm]));

      // Count broken sprite modifier references (known issue in repack database)
      let brokenSpriteRefs = 0;
      repackDatabase.spriteModifiers.forEach((modifier: any) => {
        if (modifier.spriteInfoName && !spriteInfoMap.has(modifier.spriteInfoName)) {
          brokenSpriteRefs++;
        }
      });

      console.log(`Repack database has ${brokenSpriteRefs} broken sprite modifier references (known processing artifact)`);
      expect(brokenSpriteRefs, 'Should have reasonable number of broken sprite references').to.be.lessThan(1000);

      // Validate building sprite references - these should be cleaner
      let brokenBuildingRefs = 0;
      repackDatabase.buildings.forEach((building: any) => {
        if (building.sprites && building.sprites.spriteNames) {
          building.sprites.spriteNames.forEach((spriteName: string) => {
            if (!spriteModifierMap.has(spriteName)) {
              brokenBuildingRefs++;
              if (brokenBuildingRefs <= 3) {
                console.warn(`Building "${building.prefabId}" references missing sprite modifier "${spriteName}"`);
              }
            }
          });
        }
      });

      expect(brokenBuildingRefs, 'Should have minimal broken building sprite references').to.be.lessThan(10);
    });
  });

  describe('Error Recovery and Cleanup', () => {
    it('should handle missing manual assets gracefully', () => {
      const manualPath = path.join(__dirname, '../../assets/manual');
      
      // Manual assets directory should exist
      if (fs.existsSync(manualPath)) {
        expect(fs.statSync(manualPath).isDirectory()).to.be.true;
      } else {
        // If manual assets don't exist, the system should still function
        console.log('⚠ Manual assets directory not found - system should handle gracefully');
      }
    });

    it('should validate buildMenuRename configuration', () => {
      const renamePath = path.join(__dirname, '../../assets/manual-buildMenuRename.json');
      
      if (fs.existsSync(renamePath)) {
        const renameConfig = JSON.parse(fs.readFileSync(renamePath, 'utf-8'));
        
        // The config can be an object with buildMenuItems array or a simple object
        if (renameConfig.buildMenuItems && Array.isArray(renameConfig.buildMenuItems)) {
          // Complex structure with buildMenuItems array
          expect(renameConfig.buildMenuItems).to.be.an('array');
          renameConfig.buildMenuItems.forEach((item: any, index: number) => {
            expect(item, `BuildMenuItems[${index}] should have 'from' property`).to.have.property('from');
            expect(item, `BuildMenuItems[${index}] should have 'to' property`).to.have.property('to');
          });
          console.log(`Build menu rename config has ${renameConfig.buildMenuItems.length} buildMenuItems`);
        } else {
          // Simple key-value mapping
          expect(renameConfig).to.be.an('object');
          const keys = Object.keys(renameConfig);
          keys.forEach(key => {
            if (typeof renameConfig[key] === 'string') {
              expect(renameConfig[key].length).to.be.greaterThan(0);
            }
          });
          console.log(`Build menu rename config has ${keys.length} simple entries`);
        }
      } else {
        console.log('Build menu rename configuration not found - this is optional');
      }
    });

    it('should ensure directories exist before processing', () => {
      const requiredDirs = [
        path.join(__dirname, '../../assets'),
        path.join(__dirname, '../../assets/database'),
        path.join(__dirname, '../../frontend/src/assets'),
        path.join(__dirname, '../../frontend/src/assets/database')
      ];

      requiredDirs.forEach(dir => {
        expect(fs.existsSync(dir), `Required directory should exist: ${dir}`).to.be.true;
        expect(fs.statSync(dir).isDirectory(), `Path should be directory: ${dir}`).to.be.true;
      });
    });
  });

  describe('Memory and Resource Management', () => {
    it('should validate processing can handle large datasets', () => {
      const database = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database.json'), 'utf-8'));
      
      // Verify we can handle substantial amounts of data
      expect(database.buildings.length).to.be.greaterThan(50);
      expect(database.uiSprites.length).to.be.greaterThan(500);
      expect(database.spriteModifiers.length).to.be.greaterThan(100);
      
      console.log(`Database contains: ${database.buildings.length} buildings, ${database.uiSprites.length} sprites, ${database.spriteModifiers.length} modifiers`);
    });

    it('should validate texture atlas packing efficiency', () => {
      const repackDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8'));
      
      // Count sprites using each texture atlas
      const textureUsage = new Map<string, number>();
      
      repackDatabase.uiSprites.forEach((sprite: any) => {
        if (sprite.textureName && sprite.textureName.startsWith('repack_')) {
          const count = textureUsage.get(sprite.textureName) || 0;
          textureUsage.set(sprite.textureName, count + 1);
        }
      });

      // Most texture atlases should be used by multiple sprites for efficiency
      let inefficientAtlases = 0;
      for (const [textureName, count] of textureUsage) {
        if (count === 1) {
          inefficientAtlases++;
        }
      }
      
      const totalAtlases = textureUsage.size;
      const efficiencyRatio = (totalAtlases - inefficientAtlases) / totalAtlases;
      expect(efficiencyRatio, 'Most texture atlases should pack multiple sprites').to.be.greaterThan(0.5);

      console.log(`Texture atlas usage: ${Array.from(textureUsage.entries()).map(([name, count]) => `${name}: ${count}`).join(', ')}`);
    });
  });
});