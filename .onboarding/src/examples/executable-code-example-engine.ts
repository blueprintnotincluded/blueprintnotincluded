import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import grayMatter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import {
  CodeExample,
  ExampleExtraction,
  ExampleValidationResult,
  ExecutableExampleConfig,
  ExampleUpdateResult,
  ExecutableTestSuite,
  DocumentationIntegrationResult,
  TestFile,
  ConfigFile,
  IntegrationReport,
  DocumentationUpdate,
  ExampleValidationError,
  ValidationWarning,
  ExtractionError,
  CodeExampleMetadata,
  ExampleExecutionContext,
  BulkValidationReport,
  CodeRunner
} from '../types/executable-examples';
import { logger } from '../utils/logger';

export class ExecutableCodeExampleEngine {
  private config: ExecutableExampleConfig;
  private md: MarkdownIt;
  private exampleCache: Map<string, CodeExample[]> = new Map();

  constructor(config: ExecutableExampleConfig) {
    this.config = config;
    this.md = new MarkdownIt();
    
    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDirectory)) {
      fs.mkdirSync(this.config.outputDirectory, { recursive: true });
    }
  }

  /**
   * Extract code examples from a source file (TypeScript or Markdown)
   */
  async extractCodeExamples(filePath: string): Promise<CodeExample[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileExtension = path.extname(filePath);
    const examples: CodeExample[] = [];

    try {
      if (fileExtension === '.md') {
        examples.push(...await this.extractFromMarkdown(filePath, content));
      } else if (['.ts', '.js'].includes(fileExtension)) {
        examples.push(...await this.extractFromTypeScript(filePath, content));
      }

      // Cache the results
      this.exampleCache.set(filePath, examples);
      
      logger.info(`Extracted ${examples.length} code examples from ${filePath}`);
      return examples;
    } catch (error) {
      logger.error(`Failed to extract code examples from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Validate a single code example by executing it
   */
  async validateCodeExample(example: CodeExample): Promise<ExampleValidationResult> {
    const startTime = Date.now();
    const errors: ExampleValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      if (!example.isExecutable) {
        return {
          exampleId: example.id,
          isValid: true,
          validatedAt: new Date(),
          errors: [],
          warnings: [{ type: 'style', message: 'Example marked as non-executable' }]
        };
      }

      // Create execution context
      const context = this.createExecutionContext(example);
      
      // Execute the code
      const executionResult = await this.executeCode(example, context);
      
      // Validate output if expected output is provided
      if (example.expectedOutput && executionResult.output) {
        const outputMatches = this.validateExpectedOutput(
          executionResult.output, 
          example.expectedOutput
        );
        
        if (!outputMatches) {
          errors.push({
            type: 'output_mismatch',
            message: `Expected output "${example.expectedOutput}" but got "${executionResult.output}"`
          });
        }
      }

      const executionTime = Date.now() - startTime;
      
      return {
        exampleId: example.id,
        isValid: errors.length === 0,
        executionOutput: executionResult.output,
        executionTime,
        errors,
        warnings,
        validatedAt: new Date()
      };

    } catch (error) {
      const errorType = (error as any).type || 'runtime_error';
      errors.push({
        type: errorType,
        message: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined
      });

      return {
        exampleId: example.id,
        isValid: false,
        errors,
        warnings,
        validatedAt: new Date()
      };
    }
  }

  /**
   * Update code examples when source files change
   */
  async updateCodeExamples(filePath: string): Promise<ExampleUpdateResult> {
    const previousExamples = this.exampleCache.get(filePath) || [];
    const currentExamples = await this.extractCodeExamples(filePath);

    const updatedExamples: CodeExample[] = [];
    const newExamples: CodeExample[] = [];
    const removedExamples: string[] = [];

    // Find new and updated examples
    for (const current of currentExamples) {
      const previous = previousExamples.find(p => p.id === current.id);
      if (previous) {
        if (this.hasExampleChanged(previous, current)) {
          updatedExamples.push(current);
        }
      } else {
        newExamples.push(current);
      }
    }

    // Find removed examples
    for (const previous of previousExamples) {
      const current = currentExamples.find(c => c.id === previous.id);
      if (!current) {
        removedExamples.push(previous.id);
      }
    }

    const changesSummary = this.generateChangesSummary(
      updatedExamples.length, 
      newExamples.length, 
      removedExamples.length
    );

    return {
      sourceFile: filePath,
      updatedExamples,
      newExamples,
      removedExamples,
      updateTimestamp: new Date(),
      changesSummary
    };
  }

  /**
   * Generate executable test suite for code examples
   */
  async generateExecutableTestSuite(examples: CodeExample[]): Promise<ExecutableTestSuite> {
    const testFiles: TestFile[] = [];
    const configurationFiles: ConfigFile[] = [];

    // Group examples by language
    const examplesByLanguage = this.groupExamplesByLanguage(examples);

    for (const [language, langExamples] of examplesByLanguage) {
      if (this.config.supportedLanguages.includes(language)) {
        const testFile = await this.generateTestFileForLanguage(language, langExamples);
        testFiles.push(testFile);
      }
    }

    // Generate configuration files
    configurationFiles.push(...await this.generateConfigurationFiles(examples));

    return {
      testFiles,
      configurationFiles,
      generatedAt: new Date(),
      totalExamples: examples.length
    };
  }

  /**
   * Extract and validate code examples from documentation
   */
  async extractAndValidateFromDocumentation(filePath: string): Promise<DocumentationIntegrationResult> {
    const extractedExamples = await this.extractCodeExamples(filePath);
    const validationResults: ExampleValidationResult[] = [];

    // Validate each extracted example
    for (const example of extractedExamples) {
      const validationResult = await this.validateCodeExample(example);
      validationResults.push(validationResult);
    }

    // Generate integration report
    const integrationReport = this.generateIntegrationReport(
      extractedExamples, 
      validationResults
    );

    return {
      sourceFile: filePath,
      extractedExamples,
      validationResults,
      integrationReport,
      processedAt: new Date()
    };
  }

  /**
   * Extract code examples from markdown content
   */
  private async extractFromMarkdown(filePath: string, content: string): Promise<CodeExample[]> {
    const examples: CodeExample[] = [];
    const { content: markdownContent } = grayMatter(content);

    // Parse markdown to extract code blocks
    const tokens = this.md.parse(markdownContent, {});
    let currentLineNumber = 1;

    for (const token of tokens) {
      if (token.type === 'fence' && token.info) {
        const language = token.info.trim().split(' ')[0];
        
        if (this.config.supportedLanguages.includes(language)) {
          const codeContent = token.content;
          const example = this.parseCodeExample(
            codeContent, 
            language, 
            filePath, 
            currentLineNumber
          );
          
          if (example) {
            examples.push(example);
          }
        }
      }
      
      // Track line numbers (simplified)
      if (token.map) {
        currentLineNumber = token.map[1];
      }
    }

    return examples;
  }

  /**
   * Extract code examples from TypeScript/JavaScript files
   */
  private async extractFromTypeScript(filePath: string, content: string): Promise<CodeExample[]> {
    const examples: CodeExample[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for @example comments
      if (line.includes('@example')) {
        try {
          const example = this.extractExampleFromComment(lines, i, filePath);
          if (example) {
            examples.push(example);
          }
        } catch (error) {
          logger.error(`Error extracting example from ${filePath}:${i}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return examples;
  }

  /**
   * Parse a code example from code content
   */
  private parseCodeExample(
    codeContent: string, 
    language: string, 
    sourceFile: string, 
    lineNumber: number
  ): CodeExample | null {
    const lines = codeContent.split('\n');
    
    let title = 'Untitled Example';
    let expectedOutput: string | undefined;
    const metadata: CodeExampleMetadata = {};

    // Parse comment annotations based on language
    if (language === 'bash') {
      const commentLines = lines.filter(line => line.trim().startsWith('#'));
      for (const commentLine of commentLines) {
        const comment = commentLine.replace(/^#\s*/, '');
        
        if (comment.startsWith('@example:')) {
          title = comment.substring(9).trim();
        } else if (comment.startsWith('Expected:')) {
          expectedOutput = comment.substring(9).trim();
        }
      }
    } else {
      // JavaScript/TypeScript
      const commentLines = lines.filter(line => line.trim().startsWith('//'));
      for (const commentLine of commentLines) {
        const comment = commentLine.replace(/^\/\/\s*/, '');
        
        if (comment.startsWith('@example:')) {
          title = comment.substring(9).trim();
        } else if (comment.startsWith('Expected:')) {
          expectedOutput = comment.substring(9).trim();
        } else if (comment.startsWith('@description:')) {
          metadata.description = comment.substring(13).trim();
        } else if (comment.startsWith('@tags:')) {
          metadata.tags = comment.substring(6).trim().split(',').map(t => t.trim());
        }
      }
    }

    // Remove comment lines from code based on language
    let executableCode: string;
    if (language === 'bash') {
      executableCode = lines
        .filter(line => !line.trim().startsWith('#'))
        .join('\n')
        .trim();
    } else {
      executableCode = lines
        .filter(line => !line.trim().startsWith('//'))
        .join('\n')
        .trim();
    }

    if (!executableCode) {
      return null;
    }

    return {
      id: this.generateExampleId(sourceFile, lineNumber, title),
      title,
      language,
      code: executableCode,
      sourceFile,
      lineNumber,
      isExecutable: true,
      expectedOutput,
      dependencies: this.extractDependencies(executableCode),
      metadata
    };
  }

  /**
   * Extract example from TypeScript comment block
   */
  private extractExampleFromComment(
    lines: string[], 
    startIndex: number, 
    filePath: string
  ): CodeExample | null {
    let title = 'Untitled Example';
    let codeBlockStarted = false;
    let language = 'typescript';
    const codeLines: string[] = [];
    let expectedOutput: string | undefined;
    let inComment = false;
    const metadata: CodeExampleMetadata = {};

    // Parse the comment block starting from @example line
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Start of comment block
      if (trimmedLine.includes('/**') || trimmedLine.startsWith('*')) {
        inComment = true;
      }
      
      // End of comment block
      if (trimmedLine.includes('*/')) {
        break;
      }

      if (inComment) {
        // Extract @example title
        if (trimmedLine.includes('@example')) {
          const titleMatch = trimmedLine.match(/@example\s+(.+)/);
          if (titleMatch) {
            title = titleMatch[1].trim();
          }
        } 
        // Extract @description
        else if (trimmedLine.includes('@description')) {
          const descMatch = trimmedLine.match(/@description\s+(.+)/);
          if (descMatch) {
            metadata.description = descMatch[1].trim();
          }
        }
        // Extract @tags
        else if (trimmedLine.includes('@tags')) {
          const tagsMatch = trimmedLine.match(/@tags\s+(.+)/);
          if (tagsMatch) {
            metadata.tags = tagsMatch[1].trim().split(',').map(t => t.trim());
          }
        }
        // Start of code block
        else if (trimmedLine.includes('```')) {
          if (!codeBlockStarted) {
            const langMatch = trimmedLine.match(/```(\w+)/);
            if (langMatch) {
              language = langMatch[1];
            }
            codeBlockStarted = true;
          } else {
            break; // End of code block
          }
        } 
        // Code line inside block
        else if (codeBlockStarted) {
          // Remove comment prefix and add to code
          let codeLine = line.replace(/^\s*\*\s?/, '');
          if (codeLine.trim().length > 0) {
            codeLines.push(codeLine);
          }
        }
        // Expected output
        else if (trimmedLine.includes('Expected:')) {
          const outputMatch = trimmedLine.match(/Expected:\s*(.+)/);
          if (outputMatch) {
            expectedOutput = outputMatch[1].trim();
          }
        }
      }
    }

    if (codeLines.length === 0) {
      return null;
    }

    const code = codeLines.join('\n').trim();

    return {
      id: this.generateExampleId(filePath, startIndex + 1, title),
      title,
      language,
      code,
      sourceFile: filePath,
      lineNumber: startIndex + 1,
      isExecutable: true,
      expectedOutput,
      dependencies: this.extractDependencies(code),
      metadata
    };
  }

  /**
   * Create execution context for code example
   */
  private createExecutionContext(example: CodeExample): ExampleExecutionContext {
    return {
      workingDirectory: this.config.outputDirectory,
      environment: process.env as Record<string, string>,
      timeout: this.config.validationTimeout,
      dependencies: example.dependencies
    };
  }

  /**
   * Execute code example and return result
   */
  private async executeCode(
    example: CodeExample, 
    context: ExampleExecutionContext
  ): Promise<{ output: string; exitCode: number }> {
    const runner = this.getCodeRunner(example.language);
    
    if (!runner) {
      throw new Error(`No runner configured for language: ${example.language}`);
    }

    // Create temporary file
    const tempFile = await this.createTempFile(example);
    
    try {
      return await this.runCode(runner, tempFile, context);
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * Get code runner for specific language
   */
  private getCodeRunner(language: string): CodeRunner | null {
    const runners: Record<string, CodeRunner> = {
      typescript: {
        language: 'typescript',
        command: 'npx',
        args: ['ts-node', '--transpile-only'],
        timeout: this.config.validationTimeout
      },
      javascript: {
        language: 'javascript',
        command: 'node',
        timeout: this.config.validationTimeout
      },
      bash: {
        language: 'bash',
        command: 'bash',
        timeout: this.config.validationTimeout
      }
    };

    return runners[language] || this.config.customRunners?.[language] || null;
  }

  /**
   * Create temporary file for code execution
   */
  private async createTempFile(example: CodeExample): Promise<string> {
    const extension = this.getFileExtension(example.language);
    const tempFileName = `example_${example.id}_${Date.now()}${extension}`;
    const tempFile = path.join(this.config.outputDirectory, tempFileName);
    
    fs.writeFileSync(tempFile, example.code);
    return tempFile;
  }

  /**
   * Run code using the specified runner
   */
  private async runCode(
    runner: CodeRunner, 
    filePath: string, 
    context: ExampleExecutionContext
  ): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const args = runner.args ? [...runner.args, filePath] : [filePath];
      
      const child = child_process.spawn(runner.command, args, {
        cwd: context.workingDirectory,
        env: context.environment,
        stdio: 'pipe'
      });

      let output = '';
      let error = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        error += data.toString();
      });

      // Set timeout
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Code execution timed out after ${context.timeout}ms`));
      }, context.timeout);

      child.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code !== 0 && error) {
          const syntaxError = this.detectSyntaxError(error);
          if (syntaxError) {
            const syntaxErr = new Error(`Syntax error: ${syntaxError}`);
            (syntaxErr as any).type = 'syntax_error';
            reject(syntaxErr);
          } else {
            const runtimeErr = new Error(`Runtime error: ${error}`);
            (runtimeErr as any).type = 'runtime_error';
            reject(runtimeErr);
          }
        } else {
          resolve({ output: output.trim(), exitCode: code || 0 });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Validate expected output matches actual output
   */
  private validateExpectedOutput(actualOutput: string, expectedOutput: string): boolean {
    // Simple string matching for now - could be enhanced with regex patterns
    return actualOutput.includes(expectedOutput.trim());
  }

  /**
   * Detect syntax errors from error output
   */
  private detectSyntaxError(errorOutput: string): string | null {
    const syntaxErrorPatterns = [
      /SyntaxError: (.+)/,
      /TypeError: (.+)/,
      /error TS\d+: (.+)/
    ];

    for (const pattern of syntaxErrorPatterns) {
      const match = errorOutput.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if an example has changed compared to previous version
   */
  private hasExampleChanged(previous: CodeExample, current: CodeExample): boolean {
    return previous.code !== current.code || 
           previous.expectedOutput !== current.expectedOutput ||
           previous.title !== current.title;
  }

  /**
   * Generate changes summary
   */
  private generateChangesSummary(updated: number, added: number, removed: number): string {
    const parts: string[] = [];
    
    if (updated > 0) parts.push(`${updated} updated`);
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    
    return parts.length > 0 ? parts.join(', ') : 'No changes';
  }

  /**
   * Group examples by programming language
   */
  private groupExamplesByLanguage(examples: CodeExample[]): Map<string, CodeExample[]> {
    const grouped = new Map<string, CodeExample[]>();
    
    for (const example of examples) {
      const existing = grouped.get(example.language) || [];
      existing.push(example);
      grouped.set(example.language, existing);
    }
    
    return grouped;
  }

  /**
   * Generate test file for specific language
   */
  private async generateTestFileForLanguage(
    language: string, 
    examples: CodeExample[]
  ): Promise<TestFile> {
    const extension = this.getFileExtension(language);
    const fileName = `${language}-examples.test${extension}`;
    const filePath = path.join(this.config.outputDirectory, fileName);

    let content = '';

    if (language === 'typescript' || language === 'javascript') {
      content = this.generateMochaTestContent(examples);
    } else {
      content = this.generateGenericTestContent(examples);
    }

    return {
      filePath,
      content,
      language,
      exampleIds: examples.map(e => e.id)
    };
  }

  /**
   * Generate Mocha test content for TypeScript/JavaScript examples
   */
  private generateMochaTestContent(examples: CodeExample[]): string {
    const testCases = examples.map(example => `
  it('should execute: ${example.title}', async () => {
    // Example from ${example.sourceFile}:${example.lineNumber}
    ${example.code}
    
    ${example.expectedOutput ? `
    // Validate expected output
    const output = captureConsoleOutput();
    expect(output).to.include('${example.expectedOutput}');
    ` : ''}
  });`).join('\n');

    return `import { describe, it, expect } from 'mocha';

// Helper function to capture console output (implementation needed)
function captureConsoleOutput(): string {
  // Implementation would capture console.log output
  return '';
}

describe('${examples[0]?.title || 'Generated Code Examples'}', () => {${testCases}
});`;
  }

  /**
   * Generate generic test content
   */
  private generateGenericTestContent(examples: CodeExample[]): string {
    return examples.map((example, index) => `
# Test ${index + 1}: ${example.title}
# Source: ${example.sourceFile}:${example.lineNumber}

${example.code}

${example.expectedOutput ? `# Expected output: ${example.expectedOutput}` : ''}
`).join('\n\n');
  }

  /**
   * Generate configuration files for test execution
   */
  private async generateConfigurationFiles(examples: CodeExample[]): Promise<ConfigFile[]> {
    const configFiles: ConfigFile[] = [];

    // Add package.json if TypeScript/JavaScript examples exist
    const hasJsExamples = examples.some(e => ['typescript', 'javascript'].includes(e.language));
    if (hasJsExamples) {
      configFiles.push({
        filePath: path.join(this.config.outputDirectory, 'package.json'),
        content: JSON.stringify({
          name: 'onboarding-code-examples',
          version: '1.0.0',
          scripts: {
            test: 'mocha --require ts-node/register **/*.test.ts'
          },
          devDependencies: {
            'mocha': '^10.0.0',
            'chai': '^4.0.0',
            '@types/mocha': '^10.0.0',
            '@types/chai': '^4.0.0',
            'ts-node': '^10.0.0',
            'typescript': '^5.0.0'
          }
        }, null, 2),
        type: 'package_json'
      });
    }

    return configFiles;
  }

  /**
   * Generate integration report
   */
  private generateIntegrationReport(
    examples: CodeExample[], 
    validationResults: ExampleValidationResult[]
  ): IntegrationReport {
    const validExamples = validationResults.filter(r => r.isValid).length;
    const invalidExamples = validationResults.length - validExamples;

    return {
      totalExamples: examples.length,
      validExamples,
      invalidExamples,
      newExamples: examples.length, // All examples are new in this context
      updatedExamples: 0,
      documentationUpdatesRequired: [] // Would be populated based on validation failures
    };
  }

  /**
   * Extract dependencies from code
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];
    const importMatches = code.match(/(?:import|require)\s*.*?['"]([^'"]+)['"]/g);
    
    if (importMatches) {
      for (const match of importMatches) {
        const moduleMatch = match.match(/['"]([^'"]+)['"]/);
        if (moduleMatch && !moduleMatch[1].startsWith('.')) {
          dependencies.push(moduleMatch[1]);
        }
      }
    }

    return dependencies;
  }

  /**
   * Generate unique example ID
   */
  private generateExampleId(sourceFile: string, lineNumber: number, title: string): string {
    const fileName = path.basename(sourceFile, path.extname(sourceFile));
    const sanitizedTitle = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `${fileName}-${lineNumber}-${sanitizedTitle}`;
  }

  /**
   * Get file extension for language
   */
  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: '.ts',
      javascript: '.js',
      bash: '.sh'
    };
    
    return extensions[language] || '.txt';
  }
}