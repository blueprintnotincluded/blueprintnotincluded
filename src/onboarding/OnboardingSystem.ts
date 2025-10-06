import { promises as fs } from 'fs';
import * as path from 'path';
import { ProjectStructure, ValidationResult, ValidationError } from './types/ProjectStructure';

export class OnboardingSystem {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Initialize the .onboarding directory structure
   */
  async initializeStructure(): Promise<void> {
    const onboardingRoot = path.join(this.projectPath, '.onboarding');
    
    // Create main directories
    const directories = [
      path.join(onboardingRoot, 'config'),
      path.join(onboardingRoot, 'data', 'sessions'),
      path.join(onboardingRoot, 'data', 'progress'),
      path.join(onboardingRoot, 'data', 'cache'),
      path.join(onboardingRoot, 'content', 'human'),
      path.join(onboardingRoot, 'content', 'agents'),
      path.join(onboardingRoot, 'content', 'shared')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Create schema.json
    await this.createSchemaDefinitions();
    
    // Create initial configuration files
    await this.createInitialConfiguration();
  }

  /**
   * Get project structure information
   */
  async getProjectStructure(): Promise<ProjectStructure> {
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      return {
        name: packageJson.name || 'unknown',
        version: packageJson.version || '0.0.0',
        description: packageJson.description,
        technologies: this.extractTechnologies(packageJson),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      // Return default structure if package.json doesn't exist or is invalid
      return {
        name: 'unknown',
        version: '0.0.0',
        technologies: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Validate configuration
   */
  async validateConfiguration(configPath: string): Promise<ValidationResult> {
    try {
      await fs.access(configPath);
      return { 
        success: true,
        isValid: true,
        errors: [],
        warnings: []
      };
    } catch (error) {
      return {
        success: false,
        isValid: false,
        errors: [`Configuration path does not exist: ${configPath}`],
        warnings: [],
        error: {
          type: 'ValidationError',
          message: `Configuration path does not exist: ${configPath}`,
          details: { path: configPath, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      };
    }
  }

  /**
   * Create JSON schema definitions
   */
  private async createSchemaDefinitions(): Promise<void> {
    const schemaPath = path.join(this.projectPath, '.onboarding', 'config', 'schema.json');
    
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Onboarding System Schema',
      description: 'Schema definitions for the onboarding system',
      definitions: {
        ProjectStructure: {
          type: 'object',
          required: ['name', 'version', 'technologies', 'lastUpdated'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' },
            technologies: {
              type: 'array',
              items: { type: 'string' }
            },
            architecture: { $ref: '#/definitions/ArchitecturePattern' },
            conventions: { $ref: '#/definitions/CodingStandards' },
            lastUpdated: { type: 'string', format: 'date-time' }
          }
        },
        ArchitecturePattern: {
          type: 'object',
          required: ['type', 'description', 'components'],
          properties: {
            type: {
              type: 'string',
              enum: ['mvc', 'layered', 'microservices', 'event-driven', 'hexagonal']
            },
            description: { type: 'string' },
            components: {
              type: 'array',
              items: { $ref: '#/definitions/ArchitectureComponent' }
            }
          }
        },
        ArchitectureComponent: {
          type: 'object',
          required: ['name', 'type', 'description', 'dependencies'],
          properties: {
            name: { type: 'string' },
            type: {
              type: 'string',
              enum: ['service', 'controller', 'model', 'view', 'middleware', 'repository']
            },
            description: { type: 'string' },
            dependencies: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        CodingStandards: {
          type: 'object',
          required: ['naming', 'formatting', 'patterns'],
          properties: {
            naming: { $ref: '#/definitions/NamingConventions' },
            formatting: { $ref: '#/definitions/FormattingRules' },
            patterns: {
              type: 'array',
              items: { $ref: '#/definitions/CodePatterns' }
            }
          }
        },
        NamingConventions: {
          type: 'object',
          required: ['variables', 'functions', 'classes', 'files', 'directories'],
          properties: {
            variables: { type: 'string', enum: ['camelCase', 'snake_case', 'PascalCase'] },
            functions: { type: 'string', enum: ['camelCase', 'snake_case', 'PascalCase'] },
            classes: { type: 'string', enum: ['PascalCase', 'camelCase'] },
            files: { type: 'string', enum: ['kebab-case', 'camelCase', 'PascalCase', 'snake_case'] },
            directories: { type: 'string', enum: ['kebab-case', 'camelCase', 'PascalCase', 'snake_case'] }
          }
        },
        FormattingRules: {
          type: 'object',
          required: ['indentation', 'indentSize', 'lineLength', 'trailingCommas', 'semicolons'],
          properties: {
            indentation: { type: 'string', enum: ['spaces', 'tabs'] },
            indentSize: { type: 'number', minimum: 1, maximum: 8 },
            lineLength: { type: 'number', minimum: 80, maximum: 200 },
            trailingCommas: { type: 'boolean' },
            semicolons: { type: 'boolean' }
          }
        },
        CodePatterns: {
          type: 'object',
          required: ['name', 'description', 'example'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            example: { type: 'string' },
            antiPattern: { type: 'string' }
          }
        }
      }
    };

    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));
  }

  /**
   * Create initial configuration files
   */
  private async createInitialConfiguration(): Promise<void> {
    const configDir = path.join(this.projectPath, '.onboarding', 'config');
    
    // Create validation-rules.json
    const validationRules = {
      contentValidation: {
        maxFileSize: 1048576, // 1MB
        allowedExtensions: ['.md', '.json', '.yml', '.yaml'],
        requiredSections: ['overview', 'setup', 'architecture', 'contributing']
      },
      linkValidation: {
        timeout: 5000,
        retries: 3,
        checkInterval: '24h'
      },
      schemaValidation: {
        strictMode: true,
        validateReferences: true
      }
    };

    await fs.writeFile(
      path.join(configDir, 'validation-rules.json'),
      JSON.stringify(validationRules, null, 2)
    );

    // Create templates directory and basic template
    const templatesDir = path.join(configDir, 'templates');
    await fs.mkdir(templatesDir, { recursive: true });

    const basicTemplate = {
      name: 'basic-onboarding',
      description: 'Basic onboarding template for new projects',
      sections: [
        {
          id: 'overview',
          title: 'Project Overview',
          content: '# Project Overview\n\nWelcome to {{projectName}}!\n\n## What is this project?\n\n{{projectDescription}}\n\n## Technologies\n\n{{#each technologies}}\n- {{this}}\n{{/each}}'
        },
        {
          id: 'setup',
          title: 'Development Setup',
          content: '# Development Setup\n\n## Prerequisites\n\n- Node.js {{nodeVersion}} or higher\n- npm or yarn\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Running the application\n\n```bash\nnpm start\n```'
        }
      ]
    };

    await fs.writeFile(
      path.join(templatesDir, 'basic-onboarding.json'),
      JSON.stringify(basicTemplate, null, 2)
    );
  }

  /**
   * Extract technologies from package.json
   */
  private extractTechnologies(packageJson: any): string[] {
    const technologies = new Set<string>();
    
    // Check dependencies for known technologies
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    for (const dep of Object.keys(deps || {})) {
      if (dep.includes('react')) technologies.add('React');
      if (dep.includes('angular')) technologies.add('Angular');
      if (dep.includes('vue')) technologies.add('Vue');
      if (dep.includes('express')) technologies.add('Express');
      if (dep.includes('typescript')) technologies.add('TypeScript');
      if (dep.includes('jest')) technologies.add('Jest');
      if (dep.includes('mongodb')) technologies.add('MongoDB');
      if (dep.includes('postgres')) technologies.add('PostgreSQL');
    }

    // Check for common file indicators
    if (packageJson.type === 'module') technologies.add('ES Modules');
    
    return Array.from(technologies);
  }
}