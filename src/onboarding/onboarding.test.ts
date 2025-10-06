import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as path from 'path';
import { OnboardingSystem } from './OnboardingSystem';
import { ProjectStructure } from './types/ProjectStructure';

describe('OnboardingSystem', () => {
  let tempDir: string;
  let onboardingSystem: OnboardingSystem;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(__dirname, '../../test-temp', Math.random().toString(36).substring(7));
    await fs.mkdir(tempDir, { recursive: true });
    onboardingSystem = new OnboardingSystem(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('foundation setup', () => {
    it('should create the .onboarding directory structure', async () => {
      // RED: This test will fail initially
      await onboardingSystem.initializeStructure();

      // Check that the required directories exist
      const configDir = path.join(tempDir, '.onboarding', 'config');
      const dataDir = path.join(tempDir, '.onboarding', 'data');
      const contentDir = path.join(tempDir, '.onboarding', 'content');

      const configExists = await fs.access(configDir).then(() => true).catch(() => false);
      const dataExists = await fs.access(dataDir).then(() => true).catch(() => false);
      const contentExists = await fs.access(contentDir).then(() => true).catch(() => false);

      expect(configExists).to.be.true;
      expect(dataExists).to.be.true;
      expect(contentExists).to.be.true;
    });

    it('should install required dependencies configuration', async () => {
      // RED: This test will fail initially
      await onboardingSystem.initializeStructure();

      // Check that package.json includes required dependencies
      const packageJsonPath = path.join(tempDir, 'package.json');
      const packageJsonExists = await fs.access(packageJsonPath).then(() => true).catch(() => false);
      
      if (packageJsonExists) {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        expect(deps).to.have.property('gray-matter');
        expect(deps).to.have.property('markdown-it');
        expect(deps).to.have.property('ajv');
        expect(deps).to.have.property('yaml');
      }
    });

    it('should create foundational types and interfaces', async () => {
      // RED: This test will fail initially
      const structure = await onboardingSystem.getProjectStructure();
      
      expect(structure).to.have.property('name');
      expect(structure).to.have.property('version');
      expect(structure).to.have.property('technologies');
      expect(structure.technologies).to.be.an('array');
    });
  });

  describe('configuration and schema management', () => {
    it('should create JSON schema definitions', async () => {
      // RED: This test will fail initially
      await onboardingSystem.initializeStructure();

      const schemaPath = path.join(tempDir, '.onboarding', 'config', 'schema.json');
      const schemaExists = await fs.access(schemaPath).then(() => true).catch(() => false);
      
      expect(schemaExists).to.be.true;

      if (schemaExists) {
        const schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
        expect(schema).to.have.property('$schema');
        expect(schema).to.have.property('definitions');
      }
    });

    it('should establish error handling infrastructure', async () => {
      // RED: This test will fail initially
      const errorResult = await onboardingSystem.validateConfiguration('/nonexistent/path');
      
      expect(errorResult.success).to.be.false;
      expect(errorResult.error).to.exist;
      expect(errorResult.error?.type).to.equal('ValidationError');
    });
  });
});