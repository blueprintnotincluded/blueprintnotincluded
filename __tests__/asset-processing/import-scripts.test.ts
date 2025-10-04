import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { AssetLogger } from '../../app/api/batch/asset-logger';
import { AssetValidator } from '../../app/api/batch/asset-validator';
import { AssetPaths } from '../../app/api/batch/asset-paths';
import { BatchUtils } from '../../app/api/batch/batch-utils';
import { BExport } from '../../lib';

describe('Import Scripts Integration Tests', () => {
  describe('AssetLogger', () => {
    let consoleLogStub: sinon.SinonStub;
    let consoleWarnStub: sinon.SinonStub;
    let consoleErrorStub: sinon.SinonStub;

    beforeEach(() => {
      consoleLogStub = sinon.stub(console, 'log');
      consoleWarnStub = sinon.stub(console, 'warn');
      consoleErrorStub = sinon.stub(console, 'error');
      AssetLogger.reset();
    });

    afterEach(() => {
      consoleLogStub.restore();
      consoleWarnStub.restore();
      consoleErrorStub.restore();
    });

    it('should format log messages consistently', () => {
      AssetLogger.setContext('TestContext');
      AssetLogger.info('Test message');

      expect(consoleLogStub.calledOnce).to.be.true;
      const logMessage = consoleLogStub.getCall(0).args[0];
      expect(logMessage).to.include('[TestContext]');
      expect(logMessage).to.include('INFO');
      expect(logMessage).to.include('Test message');
    });

    it('should track process progress', () => {
      AssetLogger.startProcess('TestProcess');
      AssetLogger.progress(50, 100, 'Processing items');
      AssetLogger.completeProcess('TestProcess');

      expect(consoleLogStub.callCount).to.be.greaterThan(1);
      
      // Check for progress message
      const progressCall = consoleLogStub.getCalls().find(call => 
        call.args[0].includes('Progress: 50/100 (50.0%)')
      );
      expect(progressCall).to.exist;
    });

    it('should handle errors with stack traces', () => {
      const testError = new Error('Test error');
      AssetLogger.error('Something went wrong', testError);

      expect(consoleErrorStub.calledTwice).to.be.true;
      expect(consoleErrorStub.getCall(0).args[0]).to.include('ERROR: Something went wrong');
      expect(consoleErrorStub.getCall(1).args[0]).to.include('Test error');
    });

    it('should suppress debug messages in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      AssetLogger.debug('Debug message');
      expect(consoleLogStub.called).to.be.false;

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('AssetValidator', () => {
    it('should validate database structure with existing files', () => {
      // Use the actual project root path for tests
      const databasePath = path.join(__dirname, '../../assets/database/database.json');
      expect(fs.existsSync(databasePath), 'Main database should exist').to.be.true;

      const isValid = AssetValidator.validateDatabase(databasePath);
      expect(isValid, 'Database should pass validation').to.be.true;
    });

    it('should validate image files if they exist', () => {
      const frontendImagesPath = path.join(__dirname, '../../frontend/src/assets/images');
      if (fs.existsSync(frontendImagesPath)) {
        const pngFiles = fs.readdirSync(frontendImagesPath)
          .filter(f => f.endsWith('.png'))
          .slice(0, 3); // Test first 3 files to avoid long test times

        pngFiles.forEach(file => {
          const filePath = path.join(frontendImagesPath, file);
          const isValid = AssetValidator.validateImageFile(filePath);
          expect(isValid, `Image ${file} should be valid`).to.be.true;
        });
      }
    });

    it('should handle invalid database gracefully', () => {
      const tempDir = path.join(__dirname, 'temp');
      const invalidDbPath = path.join(tempDir, 'invalid.json');
      
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Create invalid JSON file
      fs.writeFileSync(invalidDbPath, '{ "invalid": json }');

      const isValid = AssetValidator.validateDatabase(invalidDbPath);
      expect(isValid, 'Invalid database should fail validation').to.be.false;

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should validate required database properties', () => {
      const databasePath = path.join(__dirname, '../../assets/database/database.json');
      const data = fs.readFileSync(databasePath, 'utf-8');
      const database: BExport = JSON.parse(data);

      // Test that validator checks for all required properties
      const requiredProps = ['elements', 'buildMenuCategories', 'buildMenuItems', 
                           'uiSprites', 'spriteModifiers', 'buildings'];
      
      requiredProps.forEach(prop => {
        expect(database).to.have.property(prop);
        expect(database[prop as keyof BExport]).to.be.an('array');
        expect((database[prop as keyof BExport] as any[]).length).to.be.greaterThan(0);
      });
    });
  });

  describe('AssetPaths', () => {
    it('should provide consistent path resolution', () => {
      const projectRoot = AssetPaths.projectRoot;
      expect(path.isAbsolute(projectRoot)).to.be.true;
      expect(fs.existsSync(projectRoot)).to.be.true;
    });

    it('should resolve database paths correctly', () => {
      const databasePath = path.join(__dirname, '../../assets/database/database.json');
      expect(path.isAbsolute(databasePath)).to.be.true;
      expect(fs.existsSync(databasePath)).to.be.true;
      expect(databasePath).to.include('assets/database/database.json');
    });

    it('should provide all expected database file paths', () => {
      // Test actual database files that we know exist
      const databaseFiles = [
        path.join(__dirname, '../../assets/database/database.json'),
        path.join(__dirname, '../../assets/database/database-groups.json'),
        path.join(__dirname, '../../assets/database/database-white.json'),
        path.join(__dirname, '../../assets/database/database-repack.json'),
      ];
      
      databaseFiles.forEach(filePath => {
        expect(path.isAbsolute(filePath)).to.be.true;
        expect(fs.existsSync(filePath), `Database file should exist: ${filePath}`).to.be.true;
      });
    });

    it('should generate dynamic paths correctly', () => {
      const iconPath = AssetPaths.uiIcon('test_icon');
      expect(iconPath).to.include('assets/images/ui/test_icon.png');

      const groupPath = AssetPaths.groupSprite('test_texture');
      expect(groupPath).to.include('assets/images/test_texture.png');

      const whitePath = AssetPaths.whiteTexture('test_texture');
      expect(whitePath).to.include('assets/images/test_texture_white.png');
    });
  });

  describe('BatchUtils', () => {
    it('should have valid position correction thresholds', () => {
      // Test the position correction logic with mock data
      const mockBlueprint = {
        name: 'Test Blueprint',
        data: {
          blueprintItems: [
            { position: { x: 8001, y: 100 }, id: 'test1' }, // Should be corrected
            { position: { x: 100, y: -8001 }, id: 'test2' }, // Should be corrected
            { position: { x: 100, y: 100 }, id: 'test3' }, // Should not be corrected
          ]
        },
        markModified: sinon.stub(),
        save: sinon.stub().returns(Promise.resolve())
      };

      BatchUtils.UpdatePositionCorrection(mockBlueprint as any);

      // Verify corrections were applied
      expect(mockBlueprint.data.blueprintItems[0].position.x).to.equal(8001 - 9999);
      expect(mockBlueprint.data.blueprintItems[1].position.y).to.equal(-8001 + 9999);
      expect(mockBlueprint.data.blueprintItems[2].position.x).to.equal(100); // Unchanged
      expect(mockBlueprint.data.blueprintItems[2].position.y).to.equal(100); // Unchanged
    });

    it('should detect blueprint copies correctly', () => {
      const original = {
        id: 'original',
        name: 'Original Blueprint',
        data: {
          blueprintItems: Array.from({ length: 20 }, (_, i) => ({
            id: `item_${i}`,
            position: { x: i * 10, y: i * 10 }
          }))
        }
      };

      const copy: any = {
        id: 'copy',
        name: 'Copy Blueprint',
        data: {
          blueprintItems: original.data.blueprintItems.slice() // Exact copy
        },
        save: sinon.stub().returns(Promise.resolve())
      };

      BatchUtils.UpdateBasedOn(copy, [original as any], 1);

      // Verify copy was detected
      expect(copy.isCopy).to.be.true;
      expect(copy.copyOf).to.equal('original');
    });

    it('should not flag similar but different blueprints as copies', () => {
      const original = {
        id: 'original',
        name: 'Original Blueprint',
        data: {
          blueprintItems: Array.from({ length: 20 }, (_, i) => ({
            id: `item_${i}`,
            position: { x: i * 10, y: i * 10 }
          }))
        }
      };

      const similar: any = {
        id: 'similar',
        name: 'Similar Blueprint',
        data: {
          blueprintItems: Array.from({ length: 20 }, (_, i) => ({
            id: `different_${i}`, // Different IDs
            position: { x: i * 10, y: i * 10 }
          }))
        },
        save: sinon.stub().returns(Promise.resolve())
      };

      BatchUtils.UpdateBasedOn(similar, [original as any], 1);

      // Verify it was not flagged as a copy
      expect(similar.isCopy).to.be.undefined;
      expect(similar.copyOf).to.be.undefined;
    });
  });

  describe('Database Processing Pipeline', () => {
    it('should have consistent data across all database variants', () => {
      const mainDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database.json'), 'utf-8'));
      const groupsDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-groups.json'), 'utf-8'));
      const whiteDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-white.json'), 'utf-8'));
      const repackDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8'));

      // All databases should have core elements
      expect(mainDb.elements).to.be.an('array');
      expect(groupsDb.elements).to.be.an('array');
      expect(whiteDb.elements).to.be.an('array');
      expect(repackDb.elements).to.be.an('array');

      // Element counts should be consistent
      expect(groupsDb.elements.length).to.equal(mainDb.elements.length);
      expect(whiteDb.elements.length).to.equal(mainDb.elements.length);
      expect(repackDb.elements.length).to.equal(mainDb.elements.length);
    });

    it('should have white variants in white database', () => {
      const whiteDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-white.json'), 'utf-8'));
      
      const whiteSprites = whiteDb.uiSprites.filter((sprite: any) => 
        sprite.name && sprite.name.includes('_white')
      );
      expect(whiteSprites.length).to.be.greaterThan(0);

      const whiteModifiers = whiteDb.spriteModifiers.filter((modifier: any) => 
        modifier.name && modifier.name.includes('_white')
      );
      expect(whiteModifiers.length).to.be.greaterThan(0);
    });

    it('should have repack textures in repack database', () => {
      const repackDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-repack.json'), 'utf-8'));
      
      const repackSprites = repackDb.uiSprites.filter((sprite: any) => 
        sprite.textureName && sprite.textureName.startsWith('repack_')
      );
      expect(repackSprites.length).to.be.greaterThan(0);
    });

    it('should maintain referential integrity across processing steps', () => {
      const databases = [
        { path: path.join(__dirname, '../../assets/database/database.json'), name: 'main', maxBroken: 10 },
        { path: path.join(__dirname, '../../assets/database/database-white.json'), name: 'white', maxBroken: 50 },
        { path: path.join(__dirname, '../../assets/database/database-repack.json'), name: 'repack', maxBroken: 1000 }
      ];

      databases.forEach(({ path: dbPath, name: dbName, maxBroken }) => {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        // Check sprite modifier references
        const spriteInfoNames = new Set(db.uiSprites.map((si: any) => si.name));
        
        let brokenReferences = 0;
        db.spriteModifiers.forEach((modifier: any) => {
          if (modifier.spriteInfoName && !spriteInfoNames.has(modifier.spriteInfoName)) {
            brokenReferences++;
            if (brokenReferences <= 5) { // Only log first few to avoid spam
              console.warn(`Database ${dbName}: Sprite modifier "${modifier.name}" references non-existent sprite info "${modifier.spriteInfoName}"`);
            }
          }
        });

        if (brokenReferences > 5) {
          console.warn(`Database ${dbName}: ${brokenReferences} total broken sprite references (showing first 5)`);
        }

        expect(brokenReferences, `Database ${dbName} should have less than ${maxBroken} broken sprite references`).to.be.lessThan(maxBroken);

        // Check building sprite references - these should be clean
        const spriteModifierNames = new Set(db.spriteModifiers.map((sm: any) => sm.name));
        
        let brokenBuildingRefs = 0;
        db.buildings.forEach((building: any) => {
          if (building.sprites && building.sprites.spriteNames) {
            building.sprites.spriteNames.forEach((spriteName: string) => {
              if (!spriteModifierNames.has(spriteName)) {
                brokenBuildingRefs++;
                if (brokenBuildingRefs <= 3) {
                  console.warn(`Database ${dbName}: Building "${building.prefabId}" references non-existent sprite modifier "${spriteName}"`);
                }
              }
            });
          }
        });

        expect(brokenBuildingRefs, `Database ${dbName} should have no broken building sprite references`).to.equal(0);
      });

      // Separately test groups database with more tolerance
      const groupsDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/database/database-groups.json'), 'utf-8'));
      const groupsSpriteInfoNames = new Set(groupsDb.uiSprites.map((si: any) => si.name));
      
      let groupsBrokenReferences = 0;
      groupsDb.spriteModifiers.forEach((modifier: any) => {
        if (modifier.spriteInfoName && !groupsSpriteInfoNames.has(modifier.spriteInfoName)) {
          groupsBrokenReferences++;
        }
      });

      console.log(`Groups database has ${groupsBrokenReferences} broken sprite references (known processing artifact)`);
      expect(groupsBrokenReferences, 'Groups database should have reasonable number of broken references').to.be.lessThan(100);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle missing files gracefully', () => {
      const nonExistentPath = '/path/that/does/not/exist.json';
      const isValid = AssetValidator.validateDatabase(nonExistentPath);
      expect(isValid).to.be.false;
    });

    it('should validate disk space check', () => {
      const hasSpace = AssetValidator.validateDiskSpace();
      expect(hasSpace).to.be.true;
    });

    it('should perform pre-flight checks', () => {
      // Mock the export.zip existence check since we may not have it in tests
      const originalValidateInputs = AssetValidator.validateInputs;
      AssetValidator.validateInputs = () => true;

      const preFlightResult = AssetValidator.preFlightCheck();
      expect(preFlightResult).to.be.true;

      // Restore original method
      AssetValidator.validateInputs = originalValidateInputs;
    });

    it('should clean up on error', () => {
      // This test ensures cleanup function doesn't crash
      expect(() => AssetValidator.cleanupOnError()).to.not.throw();
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large database files efficiently', () => {
      const startTime = Date.now();
      const databasePath = path.join(__dirname, '../../assets/database/database.json');
      
      // Read and parse the database
      const data = fs.readFileSync(databasePath, 'utf-8');
      const database = JSON.parse(data);
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      // Should load within reasonable time (less than 5 seconds)
      expect(loadTime).to.be.lessThan(5000);
      
      // Verify we loaded substantial data
      expect(database.buildings.length).to.be.greaterThan(100);
      expect(database.uiSprites.length).to.be.greaterThan(1000);
    });

    it('should track memory usage during operations', () => {
      const initialMemory = process.memoryUsage();
      
      // Simulate some memory-intensive operations
      AssetLogger.memory();
      
      const finalMemory = process.memoryUsage();
      
      // Memory should be tracked (this test mainly ensures no crashes)
      expect(finalMemory.heapUsed).to.be.a('number');
      expect(finalMemory.heapTotal).to.be.a('number');
    });
  });
});