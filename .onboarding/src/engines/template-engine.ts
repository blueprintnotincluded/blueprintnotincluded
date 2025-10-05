import * as fs from 'fs';
import * as path from 'path';

export interface TemplateResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface TemplateValidationResult {
  isValid: boolean;
  requiredSections: string[];
  missingRequiredSections: string[];
  errors: string[];
}

export interface ProjectContext {
  projectName?: string;
  description?: string;
  technologies?: string[];
  role?: string;
  experienceLevel?: string;
  type?: string;
  framework?: string;
  database?: string;
  frontend?: string;
  hasTests?: boolean;
  hasDocker?: boolean;
  nodeVersion?: string;
  additionalPrerequisites?: string;
  title?: string;
  content?: string;
  name?: string;
  architecturePattern?: string;
  conventions?: string;
  architecture?: string;
  lastUpdated?: string;
}

/**
 * Template engine for generating and validating documentation content
 * with support for role-based customization and project context interpolation.
 */
export class TemplateEngine {
  private templates: Map<string, string> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  async generateFromTemplate(templateName: string, context: ProjectContext): Promise<TemplateResult> {
    try {
      let template: string;

      // Handle role-specific templates
      if (templateName === 'role-guide') {
        template = this.getRoleTemplate(context.role || 'fullstack', context.experienceLevel || 'intermediate');
      }
      // Handle setup guide customization
      else if (templateName === 'setup-guide') {
        template = this.getSetupGuideTemplate(context);
      }
      // Handle base layout template
      else if (templateName === 'base-layout') {
        template = this.getBaseLayoutTemplate();
      }
      // Handle regular templates
      else {
        const foundTemplate = this.templates.get(templateName);
        if (!foundTemplate) {
          return {
            success: false,
            error: `Template '${templateName}' not found`
          };
        }
        template = foundTemplate;
      }

      const content = this.interpolateTemplate(template, context);

      return {
        success: true,
        content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown template error'
      };
    }
  }

  async validateTemplate(content: string, templateType: string): Promise<TemplateValidationResult> {
    const requiredSections = this.getRequiredSections(templateType);
    const missingRequiredSections: string[] = [];
    const errors: string[] = [];

    for (const section of requiredSections) {
      if (!content.includes(section)) {
        missingRequiredSections.push(section);
      }
    }

    const isValid = missingRequiredSections.length === 0;

    return {
      isValid,
      requiredSections,
      missingRequiredSections,
      errors
    };
  }

  private initializeTemplates(): void {
    // Human onboarding template
    this.templates.set('human-onboarding', `# Welcome to {{projectName}}

## Overview
{{description}}

Technologies used: {{technologies}}

## Setup
Follow these steps to get started with {{projectName}}.

## Architecture
This project uses {{architecturePattern}} architecture.

## Contributing
Please read our contributing guidelines before submitting changes.
`);

    // Base layout template
    this.templates.set('base-layout', `# {{title}}

## Table of Contents

{{content}}
`);
  }

  private getRoleTemplate(role: string, experienceLevel: string): string {
    const roleTemplates = {
      frontend: `# Frontend Development Guide

Welcome to {{projectName}} frontend development!

${experienceLevel === 'beginner' ? '## Beginner-Friendly Resources\n\nStart with these beginner-friendly tutorials and guides.' : '## Advanced Concepts\n\nExplore advanced frontend patterns and optimizations.'}

## Technologies
- HTML/CSS/JavaScript
- Modern frameworks
- Build tools

## Getting Started
1. Set up your development environment
2. Understand the project structure
3. Start with small changes
`,
      backend: `# Backend Development Guide

Welcome to {{projectName}} backend development!

${experienceLevel === 'beginner' ? '## Beginner-Friendly Resources\n\nStart with these beginner-friendly tutorials and guides.' : '## Advanced Concepts\n\nExplore advanced concepts, backend patterns and architectures.'}

## Technologies
- Server-side frameworks
- Database management
- API design

## Getting Started
1. Set up your development environment
2. Understand the API structure
3. Start with simple endpoints
`,
      devops: `# DevOps Guide

Welcome to {{projectName}} DevOps!

${experienceLevel === 'beginner' ? '## Beginner-Friendly Resources\n\nStart with these beginner-friendly tutorials and guides.' : '## Advanced Concepts\n\nExplore advanced DevOps patterns and practices.'}

## Technologies
- Container orchestration
- CI/CD pipelines
- Infrastructure as code

## Getting Started
1. Set up your local environment
2. Understand the deployment pipeline
3. Start with small infrastructure changes
`
    };

    return roleTemplates[role as keyof typeof roleTemplates] || roleTemplates.frontend;
  }

  private getSetupGuideTemplate(context: ProjectContext): string {
    const dockerSection = context.hasDocker ? '\n\n## Docker Setup\nRun with Docker: `docker compose up`' : '';
    const testSection = context.hasTests ? '\n\n## Testing\nRun tests: `npm run test`' : '';
    
    return `# Setup Guide for {{name}}

## Prerequisites
- Node.js ${context.nodeVersion || '20+'}
- {{framework}} framework
- {{database}} database

## Technologies
- Framework: {{framework}}
- Database: {{database}}
- Frontend: {{frontend}}

## Installation
1. Clone the repository
2. Install dependencies: \`npm install\`
3. Configure environment variables
4. Start the application: \`npm run dev\`${testSection}${dockerSection}

## Verification
Your application should now be running successfully.
`;
  }

  private getBaseLayoutTemplate(): string {
    return `# {{title}}

## Table of Contents

{{content}}

---
*Generated automatically by the onboarding system*
`;
  }

  private interpolateTemplate(template: string, context: ProjectContext): string {
    let result = template;
    
    // Replace all template variables
    for (const [key, value] of Object.entries(context)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const stringValue = Array.isArray(value) ? value.join(', ') : String(value);
      result = result.replace(pattern, stringValue);
    }

    return result;
  }

  private getRequiredSections(templateType: string): string[] {
    const sectionMap = {
      'human-onboarding': ['## Overview', '## Setup', '## Architecture', '## Contributing'],
      'project-overview': ['## Key Features', '## Technology Stack'],
      'setup-guide': ['## Prerequisites', '## Installation'],
      'role-guide': ['## Technologies', '## Getting Started']
    };

    return sectionMap[templateType as keyof typeof sectionMap] || [];
  }
}