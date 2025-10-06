import { expect } from 'chai';
import { TemplateEngine, TemplateResult, TemplateValidationResult, ProjectContext } from '../engines/template-engine';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('generateFromTemplate', () => {
    it('should generate human onboarding template with project context', async () => {
      const context: ProjectContext = {
        projectName: 'TestProject',
        description: 'A comprehensive test project for onboarding',
        technologies: ['TypeScript', 'Node.js', 'Express'],
        architecturePattern: 'microservices'
      };

      const result: TemplateResult = await engine.generateFromTemplate('human-onboarding', context);

      expect(result.success).to.be.true;
      expect(result.content).to.be.a('string');
      expect(result.content).to.include('# Welcome to TestProject');
      expect(result.content).to.include('A comprehensive test project for onboarding');
      expect(result.content).to.include('TypeScript, Node.js, Express');
      expect(result.content).to.include('microservices architecture');
    });

    it('should generate role-specific templates for different developer roles', async () => {
      const context: ProjectContext = {
        projectName: 'DevProject',
        role: 'frontend',
        experienceLevel: 'beginner'
      };

      const result: TemplateResult = await engine.generateFromTemplate('role-guide', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('# Frontend Development Guide');
      expect(result.content).to.include('Welcome to DevProject frontend development!');
      expect(result.content).to.include('Beginner-Friendly Resources');
      expect(result.content).to.include('HTML/CSS/JavaScript');
    });

    it('should generate advanced content for experienced developers', async () => {
      const context: ProjectContext = {
        projectName: 'AdvancedProject',
        role: 'backend',
        experienceLevel: 'advanced'
      };

      const result: TemplateResult = await engine.generateFromTemplate('role-guide', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('# Backend Development Guide');
      expect(result.content).to.include('Advanced Concepts');
      expect(result.content).to.include('backend patterns and architectures');
    });

    it('should generate devops-specific templates', async () => {
      const context: ProjectContext = {
        projectName: 'InfraProject',
        role: 'devops',
        experienceLevel: 'intermediate'
      };

      const result: TemplateResult = await engine.generateFromTemplate('role-guide', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('# DevOps Guide');
      expect(result.content).to.include('Container orchestration');
      expect(result.content).to.include('CI/CD pipelines');
      expect(result.content).to.include('Infrastructure as code');
    });

    it('should generate customized setup guides', async () => {
      const context: ProjectContext = {
        name: 'SetupProject',
        nodeVersion: '20.18.0',
        framework: 'Express.js',
        database: 'PostgreSQL',
        frontend: 'React',
        hasTests: true,
        hasDocker: true
      };

      const result: TemplateResult = await engine.generateFromTemplate('setup-guide', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('# Setup Guide for SetupProject');
      expect(result.content).to.include('Node.js 20.18.0');
      expect(result.content).to.include('Framework: Express.js');
      expect(result.content).to.include('Database: PostgreSQL');
      expect(result.content).to.include('Frontend: React');
      expect(result.content).to.include('## Testing');
      expect(result.content).to.include('## Docker Setup');
    });

    it('should generate minimal setup guides for projects without optional features', async () => {
      const context: ProjectContext = {
        name: 'MinimalProject',
        framework: 'Vanilla JS',
        database: 'None',
        frontend: 'HTML/CSS',
        hasTests: false,
        hasDocker: false
      };

      const result: TemplateResult = await engine.generateFromTemplate('setup-guide', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('# Setup Guide for MinimalProject');
      expect(result.content).to.not.include('## Testing');
      expect(result.content).to.not.include('## Docker Setup');
    });

    it('should generate base layout templates', async () => {
      const context: ProjectContext = {
        title: 'Documentation Page',
        content: 'This is the main content of the page.'
      };

      const result: TemplateResult = await engine.generateFromTemplate('base-layout', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('# Documentation Page');
      expect(result.content).to.include('## Table of Contents');
      expect(result.content).to.include('This is the main content of the page.');
      expect(result.content).to.include('*Generated automatically by the onboarding system*');
    });

    it('should handle missing templates gracefully', async () => {
      const context: ProjectContext = { projectName: 'TestProject' };

      const result: TemplateResult = await engine.generateFromTemplate('nonexistent-template', context);

      expect(result.success).to.be.false;
      expect(result.error).to.include("Template 'nonexistent-template' not found");
    });

    it('should handle template generation errors gracefully', async () => {
      // Test with invalid context that might cause errors
      const context: ProjectContext = {
        projectName: null as any // Invalid context
      };

      const result: TemplateResult = await engine.generateFromTemplate('human-onboarding', context);

      // Should not throw, should handle gracefully
      expect(result).to.have.property('success');
    });
  });

  describe('validateTemplate', () => {
    it('should validate human onboarding template structure', async () => {
      const validContent = `# Welcome to TestProject

## Overview
This is a test project overview.

## Setup
Setup instructions here.

## Architecture
Architecture description.

## Contributing
Contributing guidelines.`;

      const result: TemplateValidationResult = await engine.validateTemplate(validContent, 'human-onboarding');

      expect(result.isValid).to.be.true;
      expect(result.requiredSections).to.include('## Overview');
      expect(result.requiredSections).to.include('## Setup');
      expect(result.requiredSections).to.include('## Architecture');
      expect(result.requiredSections).to.include('## Contributing');
      expect(result.missingRequiredSections).to.have.length(0);
    });

    it('should detect missing required sections in templates', async () => {
      const incompleteContent = `# Welcome to TestProject

## Overview
This is a test project overview.

## Setup
Setup instructions here.

// Missing Architecture and Contributing sections`;

      const result: TemplateValidationResult = await engine.validateTemplate(incompleteContent, 'human-onboarding');

      expect(result.isValid).to.be.false;
      expect(result.missingRequiredSections).to.include('## Architecture');
      expect(result.missingRequiredSections).to.include('## Contributing');
    });

    it('should validate project overview template structure', async () => {
      const validOverview = `# Project Overview

## Key Features
- Feature 1
- Feature 2

## Technology Stack
- TypeScript
- Node.js`;

      const result: TemplateValidationResult = await engine.validateTemplate(validOverview, 'project-overview');

      expect(result.isValid).to.be.true;
      expect(result.requiredSections).to.include('## Key Features');
      expect(result.requiredSections).to.include('## Technology Stack');
    });

    it('should validate setup guide template structure', async () => {
      const validSetupGuide = `# Setup Guide

## Prerequisites
- Node.js 20+
- npm

## Installation
1. Clone repo
2. Install deps`;

      const result: TemplateValidationResult = await engine.validateTemplate(validSetupGuide, 'setup-guide');

      expect(result.isValid).to.be.true;
      expect(result.requiredSections).to.include('## Prerequisites');
      expect(result.requiredSections).to.include('## Installation');
    });

    it('should validate role guide template structure', async () => {
      const validRoleGuide = `# Frontend Guide

## Technologies
- React
- TypeScript

## Getting Started
1. Set up environment
2. Run project`;

      const result: TemplateValidationResult = await engine.validateTemplate(validRoleGuide, 'role-guide');

      expect(result.isValid).to.be.true;
      expect(result.requiredSections).to.include('## Technologies');
      expect(result.requiredSections).to.include('## Getting Started');
    });

    it('should handle unknown template types gracefully', async () => {
      const content = `# Unknown Template Type`;

      const result: TemplateValidationResult = await engine.validateTemplate(content, 'unknown-type');

      expect(result.isValid).to.be.true; // Should pass if no required sections
      expect(result.requiredSections).to.have.length(0);
    });
  });

  describe('template interpolation and customization', () => {
    it('should interpolate all template variables correctly', async () => {
      const context: ProjectContext = {
        projectName: 'MyApp',
        description: 'A powerful web application',
        technologies: ['React', 'TypeScript', 'Node.js'],
        architecturePattern: 'modular monolith',
        nodeVersion: '20.18.0'
      };

      const result: TemplateResult = await engine.generateFromTemplate('human-onboarding', context);

      expect(result.success).to.be.true;
      expect(result.content).to.not.include('{{projectName}}');
      expect(result.content).to.not.include('{{description}}');
      expect(result.content).to.not.include('{{technologies}}');
      expect(result.content).to.not.include('{{architecturePattern}}');
      expect(result.content).to.include('MyApp');
      expect(result.content).to.include('A powerful web application');
      expect(result.content).to.include('React, TypeScript, Node.js');
      expect(result.content).to.include('modular monolith');
    });

    it('should handle arrays in template context', async () => {
      const context: ProjectContext = {
        projectName: 'ArrayTest',
        technologies: ['Vue.js', 'Python', 'FastAPI', 'PostgreSQL']
      };

      const result: TemplateResult = await engine.generateFromTemplate('human-onboarding', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('Vue.js, Python, FastAPI, PostgreSQL');
    });

    it('should handle missing context values gracefully', async () => {
      const context: ProjectContext = {
        projectName: 'PartialContext'
        // Missing other expected values
      };

      const result: TemplateResult = await engine.generateFromTemplate('human-onboarding', context);

      expect(result.success).to.be.true;
      // Should still generate content without throwing errors
      expect(result.content).to.include('PartialContext');
    });

    it('should handle special characters in context values', async () => {
      const context: ProjectContext = {
        projectName: 'Special-Characters_123',
        description: 'A project with "quotes" and <tags> & symbols',
        technologies: ['C++', 'C#', '.NET']
      };

      const result: TemplateResult = await engine.generateFromTemplate('human-onboarding', context);

      expect(result.success).to.be.true;
      expect(result.content).to.include('Special-Characters_123');
      expect(result.content).to.include('A project with "quotes" and <tags> & symbols');
      expect(result.content).to.include('C++, C#, .NET');
    });
  });

  describe('role-based template customization', () => {
    it('should generate appropriate content for fullstack developers', async () => {
      const context: ProjectContext = {
        projectName: 'FullStackApp',
        role: 'fullstack',
        experienceLevel: 'intermediate'
      };

      const result: TemplateResult = await engine.generateFromTemplate('role-guide', context);

      expect(result.success).to.be.true;
      // Should default to frontend template when fullstack not explicitly defined
      expect(result.content).to.include('Frontend Development Guide');
    });

    it('should customize templates based on experience level', async () => {
      const beginnerContext: ProjectContext = {
        projectName: 'BeginnerProject',
        role: 'frontend',
        experienceLevel: 'beginner'
      };

      const advancedContext: ProjectContext = {
        projectName: 'AdvancedProject',
        role: 'frontend',
        experienceLevel: 'advanced'
      };

      const beginnerResult = await engine.generateFromTemplate('role-guide', beginnerContext);
      const advancedResult = await engine.generateFromTemplate('role-guide', advancedContext);

      expect(beginnerResult.success).to.be.true;
      expect(advancedResult.success).to.be.true;

      expect(beginnerResult.content).to.include('Beginner-Friendly Resources');
      expect(advancedResult.content).to.include('Advanced Concepts');
      expect(advancedResult.content).to.not.include('Beginner-Friendly Resources');
    });

    it('should provide default values for missing role information', async () => {
      const context: ProjectContext = {
        projectName: 'DefaultProject'
        // Missing role and experienceLevel
      };

      const result: TemplateResult = await engine.generateFromTemplate('role-guide', context);

      expect(result.success).to.be.true;
      // Should default to frontend with intermediate level
      expect(result.content).to.include('Frontend Development Guide');
    });
  });

  describe('content creation workflow integration', () => {
    it('should support chained template generation', async () => {
      const baseContext: ProjectContext = {
        projectName: 'ChainedProject',
        description: 'Testing template chaining'
      };

      // Generate base onboarding
      const onboardingResult = await engine.generateFromTemplate('human-onboarding', baseContext);
      expect(onboardingResult.success).to.be.true;

      // Generate role-specific guide
      const roleContext = { ...baseContext, role: 'backend', experienceLevel: 'advanced' };
      const roleResult = await engine.generateFromTemplate('role-guide', roleContext);
      expect(roleResult.success).to.be.true;

      // Generate setup guide
      const setupContext = { ...baseContext, name: 'ChainedProject', framework: 'Express', database: 'MongoDB' };
      const setupResult = await engine.generateFromTemplate('setup-guide', setupContext);
      expect(setupResult.success).to.be.true;

      // All should be independent and successful
      expect(onboardingResult.content).to.not.equal(roleResult.content);
      expect(roleResult.content).to.not.equal(setupResult.content);
    });

    it('should maintain consistent project context across templates', async () => {
      const projectContext: ProjectContext = {
        projectName: 'ConsistentProject',
        description: 'Testing consistency',
        technologies: ['TypeScript', 'React'],
        framework: 'Next.js'
      };

      const onboardingResult = await engine.generateFromTemplate('human-onboarding', projectContext);
      const setupResult = await engine.generateFromTemplate('setup-guide', { ...projectContext, name: 'ConsistentProject' });

      expect(onboardingResult.success).to.be.true;
      expect(setupResult.success).to.be.true;

      // Both should reference the same project
      expect(onboardingResult.content).to.include('ConsistentProject');
      expect(setupResult.content).to.include('ConsistentProject');
    });
  });
});