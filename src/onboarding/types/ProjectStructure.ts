export interface ProjectStructure {
  name: string;
  version: string;
  description?: string;
  technologies: string[];
  architecture?: ArchitecturePattern;
  conventions?: CodingStandards;
  lastUpdated: string;
}

export interface ProjectMetadata {
  name: string;
  description: string;
  version: string;
  technologies: TechnologyStack;
  architecture: ArchitecturePattern;
  conventions: CodingStandards;
  lastUpdated: string;
}

export interface TechnologyStack {
  runtime: string;
  language: string;
  framework: string;
  database?: string;
  dependencies: string[];
}

export interface ArchitecturePattern {
  type?: 'mvc' | 'layered' | 'microservices' | 'event-driven' | 'hexagonal';
  pattern: string;
  description: string;
  components: ArchitectureComponent[] | string[];
}

export interface ArchitectureComponent {
  name: string;
  type: 'service' | 'controller' | 'model' | 'view' | 'middleware' | 'repository';
  description: string;
  dependencies: string[];
}

export interface CodingStandards {
  naming?: NamingConventions;
  formatting?: FormattingType;
  patterns?: CodePatterns[];
  styleGuide?: string;
  linting?: string[];
  testing?: string;
}

export interface NamingConventions {
  variables: 'camelCase' | 'snake_case' | 'PascalCase';
  functions: 'camelCase' | 'snake_case' | 'PascalCase';
  classes: 'PascalCase' | 'camelCase';
  files: 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case';
  directories: 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case';
}

export interface FormattingRules {
  indentation: 'spaces' | 'tabs';
  indentSize: number;
  lineLength: number;
  trailingCommas: boolean;
  semicolons: boolean;
}

export type FormattingType = string | FormattingRules;

export interface CodePatterns {
  name: string;
  description: string;
  example: string;
  antiPattern?: string;
}

export interface ValidationResult {
  success?: boolean;
  isValid: boolean;
  error?: ValidationError;
  errors: string[];
  warnings: string[];
  timestamp?: Date;
}

export interface ValidationError {
  type: 'ValidationError' | 'ConfigurationError' | 'FileSystemError';
  message: string;
  details?: Record<string, any>;
}