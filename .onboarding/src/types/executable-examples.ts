/**
 * Types for executable code examples system
 */

export interface CodeExample {
  id: string;
  title: string;
  language: string;
  code: string;
  sourceFile: string;
  lineNumber: number;
  isExecutable: boolean;
  expectedOutput?: string;
  dependencies: string[];
  metadata?: CodeExampleMetadata;
}

export interface CodeExampleMetadata {
  description?: string;
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  estimatedRuntime?: number;
  author?: string;
  lastUpdated?: Date;
}

export interface ExampleExtraction {
  sourceFile: string;
  extractedExamples: CodeExample[];
  extractionTimestamp: Date;
  errors: ExtractionError[];
}

export interface ExtractionError {
  type: 'parse_error' | 'invalid_syntax' | 'missing_metadata' | 'unsupported_language';
  message: string;
  lineNumber?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface ExampleValidationResult {
  exampleId: string;
  isValid: boolean;
  executionOutput?: string;
  executionTime?: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  validatedAt: Date;
}

export interface ValidationError {
  type: 'syntax_error' | 'runtime_error' | 'output_mismatch' | 'dependency_missing' | 'timeout';
  message: string;
  lineNumber?: number;
  stackTrace?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'deprecation' | 'style' | 'best_practice';
  message: string;
  suggestion?: string;
}

export interface ExampleUpdateResult {
  sourceFile: string;
  updatedExamples: CodeExample[];
  newExamples: CodeExample[];
  removedExamples: string[]; // IDs of removed examples
  updateTimestamp: Date;
  changesSummary: string;
}

export interface ExecutableTestSuite {
  testFiles: TestFile[];
  configurationFiles: ConfigFile[];
  generatedAt: Date;
  totalExamples: number;
}

export interface TestFile {
  filePath: string;
  content: string;
  language: string;
  exampleIds: string[];
}

export interface ConfigFile {
  filePath: string;
  content: string;
  type: 'jest' | 'mocha' | 'package_json' | 'tsconfig';
}

export interface DocumentationIntegrationResult {
  sourceFile: string;
  extractedExamples: CodeExample[];
  validationResults: ExampleValidationResult[];
  integrationReport: IntegrationReport;
  processedAt: Date;
}

export interface IntegrationReport {
  totalExamples: number;
  validExamples: number;
  invalidExamples: number;
  newExamples: number;
  updatedExamples: number;
  documentationUpdatesRequired: DocumentationUpdate[];
}

export interface DocumentationUpdate {
  type: 'example_outdated' | 'example_broken' | 'example_missing' | 'output_changed';
  exampleId: string;
  currentContent: string;
  suggestedContent: string;
  lineNumber: number;
  priority: 'high' | 'medium' | 'low';
}

export interface ExecutableExampleConfig {
  projectRoot: string;
  exampleSourcePaths: string[];
  outputDirectory: string;
  supportedLanguages: string[];
  validationTimeout: number;
  enableAutoUpdate: boolean;
  excludePatterns?: string[];
  customRunners?: Record<string, CodeRunner>;
}

export interface CodeRunner {
  language: string;
  command: string;
  args?: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout?: number;
}

export interface ExampleDatabase {
  examples: Map<string, CodeExample>;
  validationHistory: Map<string, ExampleValidationResult[]>;
  lastUpdated: Date;
  version: string;
}

export interface ExampleExecutionContext {
  workingDirectory: string;
  environment: Record<string, string>;
  timeout: number;
  dependencies: string[];
  setupCode?: string;
  teardownCode?: string;
}

export interface BulkValidationReport {
  totalExamples: number;
  validExamples: number;
  invalidExamples: number;
  byLanguage: Record<string, { valid: number; invalid: number }>;
  bySourceFile: Record<string, { valid: number; invalid: number }>;
  performanceMetrics: {
    totalExecutionTime: number;
    averageExecutionTime: number;
    slowestExamples: Array<{ id: string; executionTime: number }>;
  };
  generatedAt: Date;
}

export interface MaintenanceReport {
  staleExamples: CodeExample[];
  brokenExamples: CodeExample[];
  outdatedDependencies: string[];
  suggestedUpdates: DocumentationUpdate[];
  nextMaintenanceDate: Date;
  generatedAt: Date;
}