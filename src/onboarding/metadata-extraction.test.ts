import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MetadataExtractor } from './MetadataExtractor';
import { ProjectStructure as ProjectMetadataType } from './types/ProjectStructure';

describe('MetadataExtractor', () => {
  let tempDir: string;
  let metadataExtractor: MetadataExtractor;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(__dirname, '../../test-temp', Math.random().toString(36).substring(7));
    await fs.mkdir(tempDir, { recursive: true });
    metadataExtractor = new MetadataExtractor(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Task 3.1: Project metadata extraction and parsing capabilities', () => {
    it('should parse package.json and TypeScript configuration files', async () => {
      // Create mock package.json
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        description: 'A test project',
        dependencies: {
          'express': '^4.18.0',
          'typescript': '^5.0.0'
        },
        devDependencies: {
          'jest': '^29.0.0'
        }
      };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create mock tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true
        }
      };
      await fs.writeFile(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const metadata = await metadataExtractor.extractProjectMetadata();

      expect(metadata.name).to.equal('test-project');
      expect(metadata.version).to.equal('1.0.0');
      expect(metadata.description).to.equal('A test project');
      expect(metadata.technologies.dependencies).to.include('express');
      expect(metadata.technologies.dependencies).to.include('typescript');
    });

    it('should extract project structure and technology stack information', async () => {
      // Create mock file structure
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export * from "./app";');
      await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'console.log("Hello World");');

      const structure = await metadataExtractor.extractProjectStructure();

      expect(structure.directories).to.include('src');
      expect(structure.directories).to.include('tests');
      expect(structure.sourceFiles).to.have.length.greaterThan(0);
      expect(structure.totalFiles).to.be.greaterThan(0);
    });

    it('should validate metadata against schema and ensure compliance', async () => {
      const mockMetadata: any = {
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project',
        technologies: {
          runtime: 'Node.js',
          language: 'TypeScript',
          framework: 'Express',
          dependencies: ['express', 'typescript']
        },
        architecture: {
          pattern: 'layered',
          description: 'Layered architecture',
          components: ['controller', 'service', 'repository']
        },
        conventions: {
          styleGuide: 'TypeScript Standard',
          linting: ['eslint'],
          formatting: 'prettier',
          testing: 'jest'
        },
        lastUpdated: new Date().toISOString()
      };

      const validation = await metadataExtractor.validateMetadata(mockMetadata);
      
      expect(validation.isValid).to.be.true;
      expect(validation.errors).to.be.empty;
    });

    it('should implement caching mechanisms for extracted metadata', async () => {
      // Create mock package.json
      const packageJson = { name: 'test-project', version: '1.0.0' };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      // First extraction should read from file
      const metadata1 = await metadataExtractor.extractProjectMetadata();
      
      // Verify the cache was used by checking that a second call returns the same object reference
      const metadata2 = await metadataExtractor.extractProjectMetadata();

      expect(metadata1.name).to.equal(metadata2.name);
      expect(metadata1).to.equal(metadata2); // Should be the same cached object
    });
  });

  describe('Task 3.2: Coding standards and architectural decision documentation', () => {
    it('should extract coding standards from existing project patterns', async () => {
      // Create mock source files with different patterns
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'camelCaseFile.ts'), 'const camelCaseVar = "test";');
      await fs.writeFile(path.join(tempDir, 'src', 'PascalCaseFile.ts'), 'class PascalCaseClass {}');

      const standards = await metadataExtractor.extractCodingStandards();

      expect(standards.naming).to.exist;
      expect(standards.naming?.files).to.be.oneOf(['camelCase', 'PascalCase']);
      expect(standards.naming?.variables).to.equal('camelCase');
      expect(standards.naming?.classes).to.equal('PascalCase');
    });

    it('should document naming patterns and architectural decisions', async () => {
      // Create architectural files
      await fs.mkdir(path.join(tempDir, 'src', 'controllers'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'src', 'services'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'src', 'models'), { recursive: true });

      const architecture = await metadataExtractor.extractArchitecture();

      expect(architecture.pattern).to.equal('mvc');
      expect(architecture.components).to.include('controller');
      expect(architecture.components).to.include('service');
      expect(architecture.components).to.include('model');
    });

    it('should implement dependency mapping with version constraints', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
          'mongoose': '~7.0.0',
          'lodash': '4.17.21'
        }
      };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const dependencyMap = await metadataExtractor.extractDependencyMap();

      expect(dependencyMap.dependencies).to.have.property('express');
      expect(dependencyMap.dependencies.express.version).to.equal('^4.18.0');
      expect(dependencyMap.dependencies.express.constraintType).to.equal('caret');
      
      expect(dependencyMap.dependencies.mongoose.constraintType).to.equal('tilde');
      expect(dependencyMap.dependencies.lodash.constraintType).to.equal('exact');
    });
  });

  describe('Task 3.3: Machine-readable context generation for AI agents', () => {
    it('should generate structured JSON metadata for AI agent consumption', async () => {
      // Setup basic project structure
      const packageJson = {
        name: 'ai-test-project',
        version: '2.0.0',
        description: 'AI testing project'
      };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const agentContext = await metadataExtractor.generateAgentContext();

      expect(agentContext).to.have.property('metadata');
      expect(agentContext).to.have.property('structure');
      expect(agentContext).to.have.property('conventions');
      expect(agentContext).to.have.property('schemaVersion');
      
      expect(agentContext.metadata.name).to.equal('ai-test-project');
      expect(agentContext.schemaVersion).to.match(/^\d+\.\d+\.\d+$/);
    });

    it('should build project hierarchy and module relationship documentation', async () => {
      // Create complex project structure
      await fs.mkdir(path.join(tempDir, 'src', 'modules', 'auth'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'src', 'modules', 'user'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'modules', 'auth', 'index.ts'), 'export * from "./auth.service";');
      await fs.writeFile(path.join(tempDir, 'src', 'modules', 'user', 'index.ts'), 'import { AuthService } from "../auth";');

      const hierarchy = await metadataExtractor.extractProjectHierarchy();

      expect(hierarchy.modules).to.have.property('auth');
      expect(hierarchy.modules).to.have.property('user');
      expect(hierarchy.relationships).to.be.an('array');
      expect(hierarchy.relationships.some(rel => rel.from === 'user' && rel.to === 'auth')).to.be.true;
    });

    it('should validate schema for all machine-readable outputs', async () => {
      const agentContext: any = {
        metadata: { name: 'test', version: '1.0.0' },
        structure: { modules: {}, relationships: [] },
        conventions: { naming: {}, formatting: {}, patterns: [] },
        schemaVersion: '1.0.0'
      };

      const validation = await metadataExtractor.validateAgentContext(agentContext);

      expect(validation.isValid).to.be.true;
      expect(validation.errors).to.be.empty;
    });
  });
});