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
  // The committed runtime artifact is the loose database-2024.json (readable diffs),
  // which the backend reads directly and the frontend zips at build time. The .zip is
  // a gitignored build derivative, so tests read and validate the JSON directly.
  const databaseJsonPath = path.join(__dirname, '../../assets/database/database-2024.json');
  let databaseText: string;

  before(() => {
    databaseText = fs.readFileSync(databaseJsonPath, 'utf8');
  });
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
      expect(fs.existsSync(databaseJsonPath), 'database-2024.json should exist').to.be.true;

      const isValid = AssetValidator.validateDatabase(databaseJsonPath);
      expect(isValid, 'Database should pass validation').to.be.true;
    });

    it('should validate image files if they exist', () => {
      const frontendUiImagePath = path.join(__dirname, '../../frontend/src/assets/ui_image');
      if (fs.existsSync(frontendUiImagePath)) {
        const pngFiles = fs.readdirSync(frontendUiImagePath)
          .filter(f => f.endsWith('.png'))
          .slice(0, 3);

        pngFiles.forEach(file => {
          const filePath = path.join(frontendUiImagePath, file);
          const isValid = AssetValidator.validateImageFile(filePath);
          expect(isValid, `Image ${file} should be valid`).to.be.true;
        });
      }
    });

    it('should handle invalid database gracefully', () => {
      const errorStub = sinon.stub(console, 'error');
      try {
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
      } finally {
        errorStub.restore();
      }
    });

    it('should validate required database properties', () => {
      const database: BExport = JSON.parse(databaseText);

      // All required props must be arrays; spriteModifiers may be empty in 2024 format
      const nonEmptyProps = ['elements', 'buildMenuCategories', 'buildMenuItems', 'uiSprites', 'buildings'];
      nonEmptyProps.forEach(prop => {
        expect(database).to.have.property(prop);
        expect(database[prop as keyof BExport]).to.be.an('array');
        expect((database[prop as keyof BExport] as any[]).length).to.be.greaterThan(0);
      });
      expect(database).to.have.property('spriteModifiers');
      expect(database.spriteModifiers).to.be.an('array');
    });
  });

  describe('AssetPaths', () => {
    it('should provide consistent path resolution', () => {
      const projectRoot = AssetPaths.projectRoot;
      expect(path.isAbsolute(projectRoot)).to.be.true;
      expect(fs.existsSync(projectRoot)).to.be.true;
    });

    it('should resolve database paths correctly', () => {
      const databasePath = path.join(__dirname, '../../assets/database/database-2024.json');
      expect(path.isAbsolute(databasePath)).to.be.true;
      expect(fs.existsSync(databasePath)).to.be.true;
      expect(databasePath).to.include('assets/database/database-2024.json');
    });

    it('should have the 2024 database files', () => {
      // The committed runtime artifact is the loose .json, written into both asset
      // roots; the .zip is a gitignored build derivative the frontend regenerates.
      const databaseFiles = [
        path.join(__dirname, '../../assets/database/database-2024.json'),
        path.join(__dirname, '../../frontend/src/assets/database/database-2024.json'),
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
    let db: any;

    before(() => {
      db = JSON.parse(databaseText);
    });

    it('should have core arrays in the database', () => {
      expect(db.elements).to.be.an('array').with.length.greaterThan(0);
      expect(db.buildings).to.be.an('array').with.length.greaterThan(0);
      expect(db.uiSprites).to.be.an('array').with.length.greaterThan(0);
      expect(db.spriteModifiers).to.be.an('array');
    });

    it('should have overlay spriteModifiers that reference valid uiSprites', () => {
      const spriteInfoNames = new Set(db.uiSprites.map((si: any) => si.name));
      let brokenReferences = 0;
      db.spriteModifiers.forEach((modifier: any) => {
        if (modifier.spriteInfoName && !spriteInfoNames.has(modifier.spriteInfoName)) {
          brokenReferences++;
        }
      });
      expect(brokenReferences, 'All overlay spriteModifiers should reference valid uiSprites').to.equal(0);
    });

    it('should have buildings with uiImage but no spriteNames references', () => {
      db.buildings.forEach((building: any) => {
        expect(building.uiImage, `Building ${building.prefabId} should have uiImage`).to.be.a('string').with.length.greaterThan(0);
        expect(building.sprites.spriteNames, `Building ${building.prefabId} spriteNames should be empty in 2024 format`).to.be.an('array').with.length(0);
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle missing files gracefully', () => {
      const errorStub = sinon.stub(console, 'error');
      try {
        const nonExistentPath = '/path/that/does/not/exist.json';
        const isValid = AssetValidator.validateDatabase(nonExistentPath);
        expect(isValid).to.be.false;
      } finally {
        errorStub.restore();
      }
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
      const warnStub = sinon.stub(console, 'warn');
      const errorStub = sinon.stub(console, 'error');
      try {
        // This test ensures cleanup function doesn't crash
        expect(() => AssetValidator.cleanupOnError()).to.not.throw();
      } finally {
        warnStub.restore();
        errorStub.restore();
      }
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large database files efficiently', () => {
      const startTime = Date.now();

      const data = fs.readFileSync(databaseJsonPath, 'utf8');
      const database = JSON.parse(data);

      const endTime = Date.now();
      const loadTime = endTime - startTime;

      expect(loadTime).to.be.lessThan(5000);
      expect(database.buildings.length).to.be.greaterThan(100);
      expect(database.uiSprites.length).to.be.greaterThan(100);
    });

    it('should track memory usage during operations', () => {
      process.memoryUsage();
      
      // Simulate some memory-intensive operations
      AssetLogger.memory();
      
      const finalMemory = process.memoryUsage();
      
      // Memory should be tracked (this test mainly ensures no crashes)
      expect(finalMemory.heapUsed).to.be.a('number');
      expect(finalMemory.heapTotal).to.be.a('number');
    });
  });
});