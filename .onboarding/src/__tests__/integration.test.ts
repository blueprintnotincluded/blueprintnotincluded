import { expect } from 'chai';
import { OnboardingOrchestrator } from '../orchestrator/onboarding-orchestrator';
import { ProgressiveChecklist } from '../checklist/progressive-checklist';
import { UserType, DeveloperRole, StepStatus } from '../types';
// Task 6.3: AGENTS.md Integration and Migration imports
import { AgentsDocumentParser } from '../integration/agents-document-parser';
import { DocumentationAnalyzer } from '../integration/documentation-analyzer';
import { DocumentationMigrator } from '../integration/documentation-migrator';
import { ContentEnhancer } from '../integration/content-enhancer';

describe('Integration Tests', () => {
  let orchestrator: OnboardingOrchestrator;
  let checklist: ProgressiveChecklist;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
    checklist = new ProgressiveChecklist();
  });

  describe('OnboardingOrchestrator + ProgressiveChecklist Integration', () => {
    it('should create session and generate compatible checklist', () => {
      // Create onboarding session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        
        // Generate checklist for the session
        const steps = checklist.generateChecklistForRole(
          DeveloperRole.FRONTEND, 
          'darwin', 
          session.sessionId
        );
        
        expect(steps.length).to.be.greaterThan(0);
        expect(steps[0].sessionId).to.equal(session.sessionId);
        expect(steps[0].status).to.equal(StepStatus.AVAILABLE);
      }
    });

    it('should track progress through checklist steps', () => {
      // Create session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        
        // Generate checklist
        const steps = checklist.generateChecklistForRole(
          DeveloperRole.BACKEND, 
          'darwin', 
          session.sessionId
        );
        
        // Complete first step
        const progressResult = checklist.updateProgress(
          session.sessionId, 
          steps[0].id, 
          StepStatus.COMPLETED
        );
        
        expect(progressResult.isSuccess).to.be.true;
        expect(progressResult.value?.percentComplete).to.be.greaterThan(0);
      }
    });

    it('should provide role-specific guidance for different user types', () => {
      const roles = [DeveloperRole.FRONTEND, DeveloperRole.BACKEND, DeveloperRole.DEVOPS, DeveloperRole.FULLSTACK];
      
      roles.forEach(role => {
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, role);
        expect(sessionResult.isSuccess).to.be.true;
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const steps = checklist.generateChecklistForRole(role, 'darwin');
          expect(steps.length).to.be.greaterThan(0);
          
          // Each role should have different step counts or configurations
          const help = checklist.provideContextualHelp('environment-setup', role);
          expect(help).to.be.an('array');
          expect(help.length).to.be.greaterThan(0);
        }
      });
    });

    it('should handle AI agent onboarding differently from human developers', () => {
      // Human developer session
      const humanResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(humanResult.isSuccess).to.be.true;
      
      // AI agent session  
      const agentResult = orchestrator.startOnboarding(UserType.AI_AGENT);
      expect(agentResult.isSuccess).to.be.true;
      
      if (humanResult.isSuccess && agentResult.isSuccess && humanResult.value && agentResult.value) {
        // Different initial steps for different user types
        expect(humanResult.value.currentStep).to.not.equal(agentResult.value.currentStep);
        
        // Human gets progressive checklist, AI gets context loading
        expect(humanResult.value.currentStep).to.equal('environment-setup');
        expect(agentResult.value.currentStep).to.equal('context-loading');
      }
    });
  });

  describe('Platform and Role Compatibility', () => {
    it('should generate different platform instructions for same role', () => {
      const darwinSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin');
      const linuxSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'linux');
      const windowsSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'win32');
      
      const darwinSetup = darwinSteps.find(step => step.id === 'environment-setup');
      const linuxSetup = linuxSteps.find(step => step.id === 'environment-setup');
      const windowsSetup = windowsSteps.find(step => step.id === 'environment-setup');
      
      expect(darwinSetup?.platformSpecific?.darwin).to.not.equal(linuxSetup?.platformSpecific?.linux);
      expect(linuxSetup?.platformSpecific?.linux).to.not.equal(windowsSetup?.platformSpecific?.win32);
    });

    it('should generate different step sets for different roles', () => {
      const frontendSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin');
      const backendSteps = checklist.generateChecklistForRole(DeveloperRole.BACKEND, 'darwin');
      const devopsSteps = checklist.generateChecklistForRole(DeveloperRole.DEVOPS, 'darwin');
      const fullstackSteps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin');
      
      // Fullstack should have more steps than individual roles
      expect(fullstackSteps.length).to.be.greaterThan(frontendSteps.length);
      
      // Backend should have database setup, frontend should not
      const backendDb = backendSteps.find(step => step.id === 'database-setup');
      const frontendDb = frontendSteps.find(step => step.id === 'database-setup');
      
      expect(backendDb).to.exist;
      expect(frontendDb).to.be.undefined;
      
      // Frontend should have dev-server-start, backend should not
      const frontendDevServer = frontendSteps.find(step => step.id === 'dev-server-start');
      const backendDevServer = backendSteps.find(step => step.id === 'dev-server-start');
      
      expect(frontendDevServer).to.exist;
      expect(backendDevServer).to.be.undefined;
      
      // DevOps should have infrastructure setup
      const devopsInfra = devopsSteps.find(step => step.id === 'infrastructure-setup');
      expect(devopsInfra).to.exist;
    });
  });

  describe('AGENTS.md Integration and Migration System (Task 6.3)', () => {
    describe('AGENTS.md content parsing', () => {
      it('should parse AGENTS.md and extract structured content', async () => {
        const mockAgentsContent = `# AGENTS.md

This file provides guidance to AI agents when working with this repository.

## Project Overview

This is a TypeScript project with Express.js backend and Angular frontend.

## Architecture

- **Backend**: Express.js with TypeScript
- **Frontend**: Angular application
- **Database**: MongoDB with Mongoose

## Development Commands

### Backend Development
- \`npm run dev\` - Start development server
- \`npm run test\` - Run tests

### Environment Configuration

Copy \`.env.sample\` to \`.env\` and configure:
- \`DB_URI\` - MongoDB connection string
- \`JWT_SECRET\` - Secret key for JWT tokens
`;

        const parser = new AgentsDocumentParser();
        const result = await parser.parseAgentsDocument(mockAgentsContent);

        expect(result.isSuccess).to.be.true;
        expect(result.value).to.have.property('sections');
        expect(result.value.sections).to.include.keys([
          'project-overview',
          'architecture', 
          'development-commands',
          'environment-configuration'
        ]);
        expect(result.value.metadata).to.have.property('title', 'AGENTS.md');
        expect(result.value.metadata).to.have.property('type', 'agent-guidance');
      });

      it('should extract code examples and commands from AGENTS.md', async () => {
        const agentsWithCode = `# Project Guide

## Development Commands

Start the development server:
\`\`\`bash
npm run dev
\`\`\`

Run tests:
\`\`\`bash
npm run test
\`\`\`

## Configuration

Set environment variables:
\`\`\`bash
export DB_URI="mongodb://localhost:27017/mydb"
export JWT_SECRET="your-secret-key"
\`\`\`
`;

        const parser = new AgentsDocumentParser();
        const result = await parser.parseAgentsDocument(agentsWithCode);

        expect(result.isSuccess).to.be.true;
        expect(result.value.codeExamples).to.have.length(3);
        expect(result.value.codeExamples[0]).to.have.property('language', 'bash');
        expect(result.value.codeExamples[0]).to.have.property('code', 'npm run dev');
        expect(result.value.commands).to.include.members(['npm run dev', 'npm run test']);
      });

      it('should identify project technologies and dependencies', async () => {
        const agentsWithTech = `# Technology Guide

## Architecture

- **Backend**: Express.js with TypeScript
- **Frontend**: React with Vite
- **Database**: PostgreSQL with Prisma
- **Testing**: Jest and Cypress
- **Deployment**: Docker and Kubernetes

## Key Libraries

- \`express\` - Web framework
- \`prisma\` - Database ORM
- \`zod\` - Schema validation
`;

        const parser = new AgentsDocumentParser();
        const result = await parser.parseAgentsDocument(agentsWithTech);

        expect(result.isSuccess).to.be.true;
        expect(result.value.technologies).to.include.members([
          'Express.js', 'TypeScript', 'React', 'Vite', 'PostgreSQL', 'Prisma', 'Jest', 'Cypress', 'Docker', 'Kubernetes'
        ]);
        expect(result.value.dependencies).to.include.members(['express', 'prisma', 'zod']);
      });

      it('should handle malformed AGENTS.md gracefully', async () => {
        const malformedContent = `# Incomplete Document

Missing proper structure...

Random content without sections.
`;

        const parser = new AgentsDocumentParser();
        const result = await parser.parseAgentsDocument(malformedContent);

        expect(result.isSuccess).to.be.true;
        expect(result.value.sections).to.be.an('object');
        expect(result.value.warnings).to.have.length.greaterThan(0);
        expect(result.value.warnings[0]).to.include('incomplete structure');
      });
    });

    describe('existing documentation analysis', () => {
      it('should analyze existing documentation files and identify integration opportunities', async () => {
        const mockFileStructure = {
          'README.md': 'Basic project readme',
          'CONTRIBUTING.md': 'Contribution guidelines',
          'docs/api.md': 'API documentation',
          'docs/setup.md': 'Setup instructions',
          'AGENTS.md': 'Agent guidance'
        };

        const analyzer = new DocumentationAnalyzer();
        const analysis = await analyzer.analyzeExistingDocumentation(mockFileStructure);

        expect(analysis.isSuccess).to.be.true;
        expect(analysis.value.documentTypes).to.include.members([
          'readme', 'contributing', 'api-docs', 'setup-guide', 'agent-guidance'
        ]);
        expect(analysis.value.integrationOpportunities).to.have.length.greaterThan(0);
        expect(analysis.value.recommendations).to.include.deep.members([
          {
            type: 'consolidation',
            priority: 'medium',
            message: 'Merge setup.md content into main onboarding guide',
            sourceFiles: ['docs/setup.md'],
            targetSection: 'installation'
          }
        ]);
      });

      it('should detect content duplication and inconsistencies', async () => {
        const duplicatedContent = {
          'README.md': 'Setup: npm install && npm start',
          'docs/setup.md': 'Installation: npm install && npm run dev',
          'AGENTS.md': 'Development: npm run dev for local development'
        };

        const analyzer = new DocumentationAnalyzer();
        const analysis = await analyzer.analyzeExistingDocumentation(duplicatedContent);

        expect(analysis.isSuccess).to.be.true;
        expect(analysis.value.duplications).to.have.length.greaterThan(0);
        expect(analysis.value.inconsistencies).to.include.deep.members([
          {
            type: 'command-variation',
            files: ['README.md', 'docs/setup.md'],
            issue: 'Different start commands: npm start vs npm run dev'
          }
        ]);
      });

      it('should extract reusable content patterns', async () => {
        const patternedContent = {
          'AGENTS.md': '## Prerequisites\n- Node.js 20+\n- Git\n- Docker',
          'README.md': '## Requirements\n- Node.js 20 or higher\n- Git version control\n- Docker Desktop',
          'docs/setup.md': '## Before You Start\nInstall Node.js 20+, Git, and Docker'
        };

        const analyzer = new DocumentationAnalyzer();
        const analysis = await analyzer.analyzeExistingDocumentation(patternedContent);

        expect(analysis.isSuccess).to.be.true;
        expect(analysis.value.patterns).to.include.deep.members([
          {
            type: 'prerequisites',
            frequency: 3,
            variations: [
              'Node.js 20+',
              'Node.js 20 or higher', 
              'Node.js 20+'
            ],
            canonicalForm: 'Node.js 20+'
          }
        ]);
      });
    });

    describe('migration workflow engine', () => {
      it('should create migration plan for AGENTS.md integration', async () => {
        const sourceAgents = `# AGENTS.md
## Project Overview
TypeScript project with Express backend.

## Development Commands
- \`npm run dev\` - Start development
- \`npm test\` - Run tests
`;

        const existingDocs = {
          'README.md': 'Basic readme content',
          'docs/development.md': 'Development guidelines'
        };

        const migrator = new DocumentationMigrator();
        const plan = await migrator.createMigrationPlan(sourceAgents, existingDocs);

        expect(plan.isSuccess).to.be.true;
        expect(plan.value.phases).to.have.length.greaterThan(0);
        expect(plan.value.phases[0]).to.include({
          name: 'content-extraction',
          description: 'Extract structured content from AGENTS.md',
          estimatedTime: 'minutes'
        });
        expect(plan.value.contentMapping).to.have.property('project-overview');
        expect(plan.value.preservationStrategy).to.equal('backup-and-enhance');
      });

      it('should execute content migration with preservation', async () => {
        const sourceContent = `# Original AGENTS.md
## Architecture
- Backend: Express.js
- Database: MongoDB
- Frontend: Angular

## Important Notes
Critical project-specific information that must be preserved.
`;

        const migrator = new DocumentationMigrator();
        const result = await migrator.executeMigration(sourceContent, {
          preserveOriginal: true,
          enhanceContent: true,
          targetStructure: 'onboarding-guide'
        });

        expect(result.isSuccess).to.be.true;
        expect(result.value.migratedContent).to.include('# Welcome to');
        expect(result.value.migratedContent).to.include('Express.js');
        expect(result.value.migratedContent).to.include('Critical project-specific information');
        expect(result.value.preservedSections).to.include('Important Notes');
        expect(result.value.enhancements).to.have.length.greaterThan(0);
      });

      it('should validate migrated content quality', async () => {
        const migratedContent = `# Welcome to Project

## Overview
This is a comprehensive project guide migrated from AGENTS.md.

## Prerequisites
- Node.js 20+
- Git

## Installation
1. Clone repository
2. Install dependencies: \`npm install\`
3. Start development: \`npm run dev\`

## Architecture
- Backend: Express.js with TypeScript
- Frontend: Angular application
- Database: MongoDB with Mongoose
`;

        const migrator = new DocumentationMigrator();
        const validation = await migrator.validateMigratedContent(migratedContent, {
          originalAgentsPath: '/path/to/AGENTS.md',
          targetType: 'onboarding-guide'
        });

        expect(validation.isSuccess).to.be.true;
        expect(validation.value.quality.completeness).to.be.greaterThan(80);
        expect(validation.value.quality.structure).to.be.greaterThan(85);
        expect(validation.value.quality.preservation).to.be.greaterThan(90);
        expect(validation.value.missingContent).to.have.length(0);
        expect(validation.value.improvements).to.be.an('array');
      });

      it('should handle migration rollback if needed', async () => {
        const migrator = new DocumentationMigrator();
        
        // Simulate failed migration
        const failedMigration = await migrator.executeMigration('invalid content', {
          preserveOriginal: true,
          enhanceContent: true,
          targetStructure: 'onboarding-guide'
        });

        expect(failedMigration.isSuccess).to.be.false;

        // Test rollback
        const rollbackResult = await migrator.rollbackMigration('migration-123');
        
        expect(rollbackResult.isSuccess).to.be.true;
        expect(rollbackResult.value.restoredFiles).to.include('AGENTS.md');
        expect(rollbackResult.value.rollbackSummary).to.include('Original AGENTS.md restored');
      });
    });

    describe('content preservation and enhancement', () => {
      it('should preserve critical project-specific information during migration', async () => {
        const criticalContent = `# AGENTS.md

## Project Context
This is blueprintnotincluded.org - a Blueprint creation tool for Oxygen Not Included.

## Critical Configuration
- Canvas package issues with Node.js 22 - stick with Node 20
- Asset generation scripts depend on Canvas working correctly  
- MongoDB 4.2 with specific connection requirements

## Important Constraints
- Angular 13→20 requires incremental approach (7 major versions)
- Blueprint date validation bug in app/api/blueprint-controller.ts:297
`;

        const enhancer = new ContentEnhancer();
        const result = await enhancer.preserveAndEnhance(criticalContent, {
          preserveCriticalSections: ['Project Context', 'Critical Configuration', 'Important Constraints'],
          enhanceWithTemplates: true,
          addMissingStructure: true
        });

        expect(result.isSuccess).to.be.true;
        expect(result.value.enhancedContent).to.include('blueprintnotincluded.org');
        expect(result.value.enhancedContent).to.include('Canvas package issues');
        expect(result.value.enhancedContent).to.include('blueprint-controller.ts:297');
        expect(result.value.preservedSections).to.have.length(3);
        expect(result.value.addedStructure).to.include.members(['## Prerequisites', '## Installation']);
      });

      it('should enhance content with modern documentation standards', async () => {
        const basicContent = `# Simple Guide

Basic project information.

Start with: npm run dev
`;

        const enhancer = new ContentEnhancer();
        const result = await enhancer.preserveAndEnhance(basicContent, {
          addFrontmatter: true,
          improveStructure: true,
          addCodeBlocks: true,
          enhanceNavigation: true
        });

        expect(result.isSuccess).to.be.true;
        expect(result.value.enhancedContent).to.include('---\ntitle:');
        expect(result.value.enhancedContent).to.include('## Table of Contents');
        expect(result.value.enhancedContent).to.include('```bash\nnpm run dev\n```');
        expect(result.value.improvements).to.include.members([
          'added-frontmatter',
          'improved-structure', 
          'enhanced-code-formatting',
          'added-navigation'
        ]);
      });

      it('should maintain content relationships during enhancement', async () => {
        const relatedContent = `# Main Guide

See also: [Development Setup](./docs/setup.md)

Configuration described in [Environment Variables](./docs/env.md)

Reference: app/api/blueprint-controller.ts for API details
`;

        const enhancer = new ContentEnhancer();
        const result = await enhancer.preserveAndEnhance(relatedContent, {
          preserveLinks: true,
          validateReferences: true,
          updateRelativePaths: true
        });

        expect(result.isSuccess).to.be.true;
        expect(result.value.enhancedContent).to.include('./docs/setup.md');
        expect(result.value.enhancedContent).to.include('./docs/env.md');
        expect(result.value.enhancedContent).to.include('app/api/blueprint-controller.ts');
        expect(result.value.linkValidation).to.have.property('validLinks');
        expect(result.value.linkValidation).to.have.property('brokenLinks');
      });
    });
  });
});