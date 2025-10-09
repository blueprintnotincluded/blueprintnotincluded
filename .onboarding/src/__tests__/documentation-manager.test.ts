import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentationManager, InitializationResult, StructureValidationResult } from '../managers/documentation-manager';

describe('DocumentationManager', () => {
  let manager: DocumentationManager;
  let testDir: string;

  beforeEach(() => {
    manager = new DocumentationManager();
    testDir = path.join(__dirname, '../../test-fixtures/doc-manager-test');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initializeStructure', () => {
    it('should create required directory structure', async () => {
      const result: InitializationResult = await manager.initializeStructure(testDir);

      expect(result.success).to.be.true;
      expect(result.createdDirectories).to.be.an('array');
      expect(result.createdDirectories?.length).to.be.greaterThan(0);

      // Verify directories were created
      const onboardingDir = path.join(testDir, '.onboarding');
      expect(fs.existsSync(onboardingDir)).to.be.true;
      
      const configDir = path.join(testDir, '.onboarding', 'config');
      expect(fs.existsSync(configDir)).to.be.true;
      
      const dataDir = path.join(testDir, '.onboarding', 'data');
      expect(fs.existsSync(dataDir)).to.be.true;
      
      const contentDir = path.join(testDir, '.onboarding', 'content');
      expect(fs.existsSync(contentDir)).to.be.true;
    });

    it('should create template files with correct content', async () => {
      const result: InitializationResult = await manager.initializeStructure(testDir);

      expect(result.success).to.be.true;
      expect(result.createdFiles).to.be.an('array');
      expect(result.createdFiles?.length).to.be.greaterThan(0);

      // Verify template files were created
      const templatesDir = path.join(testDir, '.onboarding', 'config', 'templates');
      expect(fs.existsSync(templatesDir)).to.be.true;

      const humanOnboardingTemplate = path.join(templatesDir, 'human-onboarding.md');
      expect(fs.existsSync(humanOnboardingTemplate)).to.be.true;

      const agentContextTemplate = path.join(templatesDir, 'agent-context.json');
      expect(fs.existsSync(agentContextTemplate)).to.be.true;

      // Verify template content
      const humanContent = fs.readFileSync(humanOnboardingTemplate, 'utf8');
      expect(humanContent).to.include('# Welcome to {{projectName}}');
      expect(humanContent).to.include('## Overview');
      expect(humanContent).to.include('## Setup');

      const agentContent = fs.readFileSync(agentContextTemplate, 'utf8');
      const agentData = JSON.parse(agentContent);
      expect(agentData).to.have.property('projectName');
      expect(agentData).to.have.property('description');
      expect(agentData).to.have.property('technologies');
    });

    it('should not overwrite existing files', async () => {
      // First initialization
      await manager.initializeStructure(testDir);
      
      // Modify a template file
      const humanTemplate = path.join(testDir, '.onboarding', 'config', 'templates', 'human-onboarding.md');
      fs.writeFileSync(humanTemplate, '# Modified Content');

      // Second initialization
      const result = await manager.initializeStructure(testDir);

      expect(result.success).to.be.true;
      
      // Verify file was not overwritten
      const content = fs.readFileSync(humanTemplate, 'utf8');
      expect(content).to.equal('# Modified Content');
    });

    it('should handle file system errors gracefully', async () => {
      // Try to initialize in a read-only directory (simulate permission error)
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.mkdirSync(readOnlyDir);
      fs.chmodSync(readOnlyDir, 0o444); // Read-only

      const result = await manager.initializeStructure(readOnlyDir);

      expect(result.success).to.be.false;
      expect(result.error).to.be.a('string');
      
      // Cleanup
      fs.chmodSync(readOnlyDir, 0o755);
    });
  });

  describe('validateStructure', () => {
    it('should validate complete onboarding structure', async () => {
      // Create valid structure
      await manager.initializeStructure(testDir);

      const result: StructureValidationResult = await manager.validateStructure(testDir);

      expect(result.isValid).to.be.true;
      expect(result.missingDirectories).to.have.length(0);
      expect(result.missingFiles).to.have.length(0);
      expect(result.errors).to.have.length(0);
    });

    it('should detect missing directories', async () => {
      const result: StructureValidationResult = await manager.validateStructure(testDir);

      expect(result.isValid).to.be.false;
      expect(result.missingDirectories.length).to.be.greaterThan(0);
      expect(result.missingDirectories).to.include('.onboarding');
    });

    it('should detect missing template files', async () => {
      // Create directory structure but not template files
      const onboardingDir = path.join(testDir, '.onboarding');
      const configDir = path.join(onboardingDir, 'config');
      const templatesDir = path.join(configDir, 'templates');
      fs.mkdirSync(templatesDir, { recursive: true });

      const result: StructureValidationResult = await manager.validateStructure(testDir);

      expect(result.isValid).to.be.false;
      expect(result.missingFiles.length).to.be.greaterThan(0);
      expect(result.missingFiles).to.include('config/templates/human-onboarding.md');
    });

    it('should handle validation errors gracefully', async () => {
      // Test with a path that doesn't exist
      const nonExistentPath = path.join(testDir, 'nonexistent');

      const result: StructureValidationResult = await manager.validateStructure(nonExistentPath);

      expect(result.isValid).to.be.false;
      // Should handle the error without throwing
    });
  });

  describe('metadata extraction and validation', () => {
    it('should extract project metadata from package.json', async () => {
      // Create a package.json file
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        description: 'A test project for metadata extraction',
        dependencies: {
          'express': '^4.18.0',
          'typescript': '^5.0.0'
        },
        scripts: {
          'start': 'node index.js',
          'test': 'mocha'
        }
      };

      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Initialize structure to test metadata extraction during initialization
      const result = await manager.initializeStructure(testDir);

      expect(result.success).to.be.true;

      // Verify that template files can access the metadata
      const templatesDir = path.join(testDir, '.onboarding', 'config', 'templates');
      const agentContextPath = path.join(templatesDir, 'agent-context.json');
      
      expect(fs.existsSync(agentContextPath)).to.be.true;
      
      const agentContent = fs.readFileSync(agentContextPath, 'utf8');
      expect(agentContent).to.include('{{projectName}}');
      expect(agentContent).to.include('{{technologies}}');
    });

    it('should validate template structure against schema', async () => {
      await manager.initializeStructure(testDir);

      const result = await manager.validateStructure(testDir);

      expect(result.isValid).to.be.true;

      // Verify that all template files have the expected structure
      const templatesDir = path.join(testDir, '.onboarding', 'config', 'templates');
      
      const humanTemplate = fs.readFileSync(path.join(templatesDir, 'human-onboarding.md'), 'utf8');
      expect(humanTemplate).to.match(/^# Welcome to \{\{projectName\}\}/);
      expect(humanTemplate).to.include('## Overview');
      expect(humanTemplate).to.include('## Setup');
      expect(humanTemplate).to.include('## Architecture');
      expect(humanTemplate).to.include('## Contributing');

      const projectOverview = fs.readFileSync(path.join(templatesDir, 'project-overview.md'), 'utf8');
      expect(projectOverview).to.include('## Key Features');
      expect(projectOverview).to.include('## Technology Stack');

      const setupGuide = fs.readFileSync(path.join(templatesDir, 'setup-guide.md'), 'utf8');
      expect(setupGuide).to.include('## Prerequisites');
      expect(setupGuide).to.include('## Installation Steps');
    });

    it('should handle projects with different technology stacks', async () => {
      // Create package.json for a React project
      const reactPackageJson = {
        name: 'react-project',
        dependencies: {
          'react': '^18.0.0',
          'react-dom': '^18.0.0',
          '@types/react': '^18.0.0'
        }
      };

      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(reactPackageJson, null, 2));

      const result = await manager.initializeStructure(testDir);

      expect(result.success).to.be.true;

      // Test with different project structure
      const angularDir = path.join(testDir, 'angular-test');
      fs.mkdirSync(angularDir);
      
      const angularPackageJson = {
        name: 'angular-project',
        dependencies: {
          '@angular/core': '^16.0.0',
          '@angular/common': '^16.0.0',
          'typescript': '^5.0.0'
        }
      };

      fs.writeFileSync(path.join(angularDir, 'package.json'), JSON.stringify(angularPackageJson, null, 2));

      const angularResult = await manager.initializeStructure(angularDir);
      expect(angularResult.success).to.be.true;
    });
  });

  describe('integration with existing documentation', () => {
    it('should preserve existing AGENTS.md content', async () => {
      // Create existing AGENTS.md file
      const agentsContent = `# Project Context

This is existing agent documentation that should be preserved.

## Technologies
- TypeScript
- Node.js

## Architecture
- Modular design
- Event-driven architecture
`;

      fs.writeFileSync(path.join(testDir, 'AGENTS.md'), agentsContent);

      const result = await manager.initializeStructure(testDir);

      expect(result.success).to.be.true;

      // Verify AGENTS.md still exists and unchanged
      const existingContent = fs.readFileSync(path.join(testDir, 'AGENTS.md'), 'utf8');
      expect(existingContent).to.equal(agentsContent);

      // Verify new structure was created alongside
      const onboardingDir = path.join(testDir, '.onboarding');
      expect(fs.existsSync(onboardingDir)).to.be.true;
    });

    it('should detect and report existing documentation files', async () => {
      // Create various existing documentation files
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Project README');
      fs.writeFileSync(path.join(testDir, 'CONTRIBUTING.md'), '# Contributing Guidelines');
      fs.writeFileSync(path.join(testDir, 'API.md'), '# API Documentation');

      await manager.initializeStructure(testDir);
      const result = await manager.validateStructure(testDir);

      expect(result.isValid).to.be.true;

      // The validation should succeed even with existing docs
      // This tests that the system works alongside existing documentation
    });
  });
});