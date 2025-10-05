import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

describe('Documentation Structure and Template System', () => {
  const testProjectPath = path.join(__dirname, 'test-project');
  const onboardingPath = path.join(testProjectPath, '.onboarding');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectPath, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testProjectPath)) {
      fs.rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  describe('Task 2.1: Directory structure initialization capability', () => {
    it('should automatically create predefined onboarding directory structures', async () => {
      const { DocumentationManager } = await import('../../.onboarding/src/managers/documentation-manager');
      const manager = new DocumentationManager();

      const result = await manager.initializeStructure(testProjectPath);

      expect(result.success).to.be.true;
      expect(fs.existsSync(onboardingPath)).to.be.true;
      
      // Check main directories
      expect(fs.existsSync(path.join(onboardingPath, 'config'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'data'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'content'))).to.be.true;
      
      // Check subdirectories
      expect(fs.existsSync(path.join(onboardingPath, 'config', 'templates'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'data', 'sessions'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'data', 'progress'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'content', 'human'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'content', 'agents'))).to.be.true;
      expect(fs.existsSync(path.join(onboardingPath, 'content', 'shared'))).to.be.true;
    });

    it('should create template definitions for different documentation types', async () => {
      const { DocumentationManager } = await import('../../.onboarding/src/managers/documentation-manager');
      const manager = new DocumentationManager();

      await manager.initializeStructure(testProjectPath);

      const templatesDir = path.join(onboardingPath, 'config', 'templates');
      const templateFiles = fs.readdirSync(templatesDir);

      expect(templateFiles).to.include('human-onboarding.md');
      expect(templateFiles).to.include('agent-context.json');
      expect(templateFiles).to.include('project-overview.md');
      expect(templateFiles).to.include('setup-guide.md');
    });

    it('should provide directory structure validation and verification functionality', async () => {
      const { DocumentationManager } = await import('../../.onboarding/src/managers/documentation-manager');
      const manager = new DocumentationManager();

      // Test with empty directory
      const validationResult = await manager.validateStructure(testProjectPath);
      expect(validationResult.isValid).to.be.false;
      expect(validationResult.missingDirectories).to.include('.onboarding');

      // Initialize structure
      await manager.initializeStructure(testProjectPath);

      // Test with complete structure
      const validationResultAfter = await manager.validateStructure(testProjectPath);
      expect(validationResultAfter.isValid).to.be.true;
      expect(validationResultAfter.missingDirectories).to.be.empty;
    });

    it('should detect and flag missing required onboarding files', async () => {
      const { DocumentationManager } = await import('../../.onboarding/src/managers/documentation-manager');
      const manager = new DocumentationManager();

      await manager.initializeStructure(testProjectPath);

      // Remove a required file
      const requiredFile = path.join(onboardingPath, 'config', 'templates', 'human-onboarding.md');
      fs.unlinkSync(requiredFile);

      const validationResult = await manager.validateStructure(testProjectPath);
      expect(validationResult.isValid).to.be.false;
      expect(validationResult.missingFiles).to.include('config/templates/human-onboarding.md');
    });
  });

  describe('Task 2.2: Template generation and content creation system', () => {
    it('should create template engine for generating documentation with placeholder content', async () => {
      const { TemplateEngine } = await import('../../.onboarding/src/engines/template-engine');
      const engine = new TemplateEngine();

      const templateResult = await engine.generateFromTemplate('human-onboarding', {
        projectName: 'Test Project',
        description: 'A test project for onboarding',
        technologies: ['TypeScript', 'Node.js']
      });

      expect(templateResult.success).to.be.true;
      expect(templateResult.content).to.include('Test Project');
      expect(templateResult.content).to.include('A test project for onboarding');
      expect(templateResult.content).to.include('TypeScript');
      expect(templateResult.content).to.include('Node.js');
    });

    it('should implement content templates for different user roles and experience levels', async () => {
      const { TemplateEngine } = await import('../../.onboarding/src/engines/template-engine');
      const engine = new TemplateEngine();

      // Test frontend developer template
      const frontendTemplate = await engine.generateFromTemplate('role-guide', {
        role: 'frontend',
        experienceLevel: 'beginner'
      });

      expect(frontendTemplate.success).to.be.true;
      expect(frontendTemplate.content).to.include('Frontend Development');
      expect(frontendTemplate.content).to.include('beginner-friendly');

      // Test backend developer template
      const backendTemplate = await engine.generateFromTemplate('role-guide', {
        role: 'backend',
        experienceLevel: 'advanced'
      });

      expect(backendTemplate.success).to.be.true;
      expect(backendTemplate.content).to.include('Backend Development');
      expect(backendTemplate.content).to.include('advanced concepts');
    });

    it('should build template customization system based on project context', async () => {
      const { TemplateEngine } = await import('../../.onboarding/src/engines/template-engine');
      const engine = new TemplateEngine();

      const projectContext = {
        name: 'Blueprint Manager',
        type: 'web-application',
        framework: 'Express.js',
        database: 'MongoDB',
        frontend: 'Angular',
        hasTests: true,
        hasDocker: true
      };

      const customizedTemplate = await engine.generateFromTemplate('setup-guide', projectContext);

      expect(customizedTemplate.success).to.be.true;
      expect(customizedTemplate.content).to.include('Express.js');
      expect(customizedTemplate.content).to.include('MongoDB');
      expect(customizedTemplate.content).to.include('Angular');
      expect(customizedTemplate.content).to.include('npm run test');
      expect(customizedTemplate.content).to.include('docker');
    });

    it('should validate templates to ensure required sections are present', async () => {
      const { TemplateEngine } = await import('../../.onboarding/src/engines/template-engine');
      const engine = new TemplateEngine();

      const validTemplate = await engine.generateFromTemplate('human-onboarding', {
        projectName: 'Test Project'
      });

      const validationResult = await engine.validateTemplate(validTemplate.content, 'human-onboarding');

      expect(validationResult.isValid).to.be.true;
      expect(validationResult.requiredSections).to.include('## Overview');
      expect(validationResult.requiredSections).to.include('## Setup');
      expect(validationResult.requiredSections).to.include('## Architecture');
      expect(validationResult.requiredSections).to.include('## Contributing');

      // Test with incomplete template
      const incompleteTemplate = '# Test\nOnly a title';
      const invalidValidation = await engine.validateTemplate(incompleteTemplate, 'human-onboarding');

      expect(invalidValidation.isValid).to.be.false;
      expect(invalidValidation.missingRequiredSections).to.not.be.empty;
    });

    it('should support template inheritance and composition', async () => {
      const { TemplateEngine } = await import('../../.onboarding/src/engines/template-engine');
      const engine = new TemplateEngine();

      const baseTemplate = await engine.generateFromTemplate('base-layout', {
        title: 'Test Guide',
        content: 'Custom content here'
      });

      expect(baseTemplate.success).to.be.true;
      expect(baseTemplate.content).to.include('Test Guide');
      expect(baseTemplate.content).to.include('Custom content here');
      expect(baseTemplate.content).to.include('## Table of Contents');
    });
  });
});