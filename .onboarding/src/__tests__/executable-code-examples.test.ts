import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { ExecutableCodeExampleEngine } from '../examples/executable-code-example-engine';
import { 
  CodeExample, 
  ExampleExtraction, 
  ExampleValidationResult, 
  ExecutableExampleConfig 
} from '../types/executable-examples';

describe('ExecutableCodeExampleEngine', () => {
  let engine: ExecutableCodeExampleEngine;
  let sandbox: sinon.SinonSandbox;
  let tempDir: string;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    tempDir = path.join(__dirname, 'temp-test-examples');
    
    const config: ExecutableExampleConfig = {
      projectRoot: tempDir,
      exampleSourcePaths: ['src/**/*.ts', 'docs/**/*.md'],
      outputDirectory: path.join(tempDir, '.examples'),
      supportedLanguages: ['typescript', 'javascript', 'bash'],
      validationTimeout: 5000,
      enableAutoUpdate: true
    };

    engine = new ExecutableCodeExampleEngine(config);
    
    // Create test directory structure
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    sandbox.restore();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractCodeExamples', () => {
    it('should extract executable code examples from TypeScript files', async () => {
      // Arrange
      const sourceFile = path.join(tempDir, 'example.ts');
      const sourceContent = `
/**
 * @example Basic usage
 * \`\`\`typescript
 * import { Calculator } from './calculator';
 * const calc = new Calculator();
 * const result = calc.add(2, 3);
 * console.log(result); // Expected: 5
 * \`\`\`
 */
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}`;

      fs.writeFileSync(sourceFile, sourceContent);

      // Act
      const results = await engine.extractCodeExamples(sourceFile);

      // Assert
      expect(results).to.have.length(1);
      expect(results[0]).to.exist;
      expect(results[0].language).to.equal('typescript');
      expect(results[0].title).to.equal('Basic usage');
      expect(results[0].code).to.include('const calc = new Calculator()');
      expect(results[0].code).to.include('Expected: 5');
      expect(results[0].isExecutable).to.be.true;
    });

    it('should extract code examples from markdown documentation', async () => {
      // Arrange
      const markdownFile = path.join(tempDir, 'readme.md');
      const markdownContent = `
# API Documentation

## Usage Examples

\`\`\`typescript
// @example: User creation example
import { User } from './user';

const user = new User('john@example.com');
user.setName('John Doe');
console.log(user.getName()); // Expected: "John Doe"
\`\`\`

\`\`\`bash
# @example: Build script example  
npm run build
npm run test
\`\`\`
`;

      fs.writeFileSync(markdownFile, markdownContent);

      // Act
      const results = await engine.extractCodeExamples(markdownFile);

      // Assert
      expect(results).to.have.length(2);
      expect(results[0].language).to.equal('typescript');
      expect(results[0].title).to.equal('User creation example');
      expect(results[1].language).to.equal('bash');
      expect(results[1].title).to.equal('Build script example');
    });

    it('should handle files with no code examples', async () => {
      // Arrange
      const sourceFile = path.join(tempDir, 'no-examples.ts');
      fs.writeFileSync(sourceFile, 'export const value = 42;');

      // Act
      const results = await engine.extractCodeExamples(sourceFile);

      // Assert
      expect(results).to.have.length(0);
    });
  });

  describe('validateCodeExample', () => {
    it('should validate executable TypeScript code examples', async () => {
      // Arrange
      const example: CodeExample = {
        id: 'test-example-1',
        title: 'Calculator test',
        language: 'typescript',
        code: 'const result = 2 + 3;\nconsole.log(result);',
        sourceFile: 'test.ts',
        lineNumber: 10,
        isExecutable: true,
        expectedOutput: '5',
        dependencies: []
      };

      // Act
      const result = await engine.validateCodeExample(example);

      // Assert
      expect(result.isValid).to.be.true;
      expect(result.executionOutput).to.include('5');
      expect(result.errors).to.have.length(0);
    });

    it('should detect syntax errors in code examples', async () => {
      // Arrange
      const example: CodeExample = {
        id: 'test-example-2',
        title: 'Invalid syntax',
        language: 'typescript',
        code: 'const result = 2 +;', // Invalid syntax
        sourceFile: 'test.ts',
        lineNumber: 15,
        isExecutable: true,
        expectedOutput: '',
        dependencies: []
      };

      // Act
      const result = await engine.validateCodeExample(example);

      // Assert
      expect(result.isValid).to.be.false;
      expect(result.errors).to.have.length.greaterThan(0);
      expect(result.errors[0].type).to.equal('syntax_error');
    });

    it('should validate expected output matches actual output', async () => {
      // Arrange
      const example: CodeExample = {
        id: 'test-example-3',
        title: 'Output mismatch',
        language: 'typescript',
        code: 'console.log("Hello World");',
        sourceFile: 'test.ts',
        lineNumber: 20,
        isExecutable: true,
        expectedOutput: 'Goodbye World', // Wrong expected output
        dependencies: []
      };

      // Act
      const result = await engine.validateCodeExample(example);

      // Assert
      expect(result.isValid).to.be.false;
      expect(result.errors).to.have.length.greaterThan(0);
      expect(result.errors[0].type).to.equal('output_mismatch');
    });
  });

  describe('updateCodeExamples', () => {
    it('should update code examples when source files change', async () => {
      // Arrange
      const sourceFile = path.join(tempDir, 'updating-example.ts');
      const initialContent = `
/**
 * @example Simple addition
 * \`\`\`typescript
 * const result = add(1, 2);
 * console.log(result); // Expected: 3
 * \`\`\`
 */
export function add(a: number, b: number): number {
  return a + b;
}`;

      fs.writeFileSync(sourceFile, initialContent);
      await engine.extractCodeExamples(sourceFile);

      // Act - Update the source file
      const updatedContent = initialContent.replace('add(1, 2)', 'add(5, 10)').replace('Expected: 3', 'Expected: 15');
      fs.writeFileSync(sourceFile, updatedContent);
      
      const updateResult = await engine.updateCodeExamples(sourceFile);

      // Assert
      expect(updateResult.updatedExamples).to.have.length(1);
      expect(updateResult.updatedExamples[0].code).to.include('add(5, 10)');
      expect(updateResult.updatedExamples[0].code).to.include('Expected: 15');
    });

    it('should maintain code example metadata during updates', async () => {
      // Arrange
      const sourceFile = path.join(tempDir, 'metadata-example.ts');
      const content = `
/**
 * @example User management
 * @description Demonstrates user creation and management
 * @tags user, management, example
 * \`\`\`typescript
 * const user = new User('test@example.com');
 * \`\`\`
 */
export class User {
  constructor(public email: string) {}
}`;

      fs.writeFileSync(sourceFile, content);
      // Don't call extractCodeExamples first - let updateCodeExamples find the new examples

      // Act
      const updateResult = await engine.updateCodeExamples(sourceFile);

      // Assert
      expect(updateResult.newExamples).to.have.length(1);
      expect(updateResult.newExamples[0].title).to.equal('User management');
      expect(updateResult.newExamples[0].metadata?.description).to.equal('Demonstrates user creation and management');
      expect(updateResult.newExamples[0].metadata?.tags).to.include('user');
    });
  });

  describe('generateExecutableTestSuite', () => {
    it('should generate test files for all extracted code examples', async () => {
      // Arrange
      const examples: CodeExample[] = [
        {
          id: 'example-1',
          title: 'Math operations',
          language: 'typescript',
          code: 'const sum = 1 + 1;\nconsole.log(sum);',
          sourceFile: 'math.ts',
          lineNumber: 5,
          isExecutable: true,
          expectedOutput: '2',
          dependencies: []
        }
      ];

      // Act
      const testSuite = await engine.generateExecutableTestSuite(examples);

      // Assert
      expect(testSuite.testFiles).to.have.length(1);
      expect(testSuite.testFiles[0].content).to.include('describe(\'Math operations\'');
      expect(testSuite.testFiles[0].content).to.include('expect(output).to.include(\'2\')');
    });
  });

  describe('integration with documentation workflow', () => {
    it('should integrate with existing documentation validation', async () => {
      // Arrange
      const docFile = path.join(tempDir, 'integration-doc.md');
      const docContent = `
# Integration Example

\`\`\`typescript
// @example: Integration test
import { Service } from './service';
const service = new Service();
const result = service.process();
console.log(result); // Expected: "processed"
\`\`\`
`;

      fs.writeFileSync(docFile, docContent);

      // Act
      const extractionResult = await engine.extractAndValidateFromDocumentation(docFile);

      // Assert
      expect(extractionResult.extractedExamples).to.have.length(1);
      expect(extractionResult.validationResults).to.have.length(1);
      expect(extractionResult.integrationReport.totalExamples).to.equal(1);
    });
  });
});