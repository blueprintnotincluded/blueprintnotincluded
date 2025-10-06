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

// Task 6.2: Template Compliance and Style Guide Enforcement Interfaces
export interface TemplateComplianceResult {
  isCompliant: boolean;
  score: number;
  violations: ComplianceViolation[];
  scoreBreakdown: {
    structureScore: number;
    contentScore: number;
    formattingScore: number;
  };
}

export interface ComplianceViolation {
  type: 'structure' | 'content' | 'formatting';
  message: string;
  severity: 'error' | 'warning' | 'suggestion';
  line?: number;
  suggestion?: string;
}

export interface StyleGuideResult {
  violations: StyleViolation[];
  isValid: boolean;
  score: number;
}

export interface StyleViolation {
  type: 'formatting' | 'structure' | 'style';
  rule: string;
  message: string;
  line: number;
  severity: 'error' | 'warning' | 'suggestion';
  suggestion?: string;
}

export interface TemplateSuggestions {
  missingSections: string[];
  corrections: TemplateCorrection[];
  correctedTemplate: string;
  improvementScore: number;
}

export interface TemplateCorrection {
  type: 'add-section' | 'fix-format' | 'improve-content';
  section?: string;
  content: string;
  position: number;
}

export interface FormattingCorrections {
  correctedContent: string;
  appliedFixes: string[];
  fixCount: number;
}

export interface DocumentStructureResult {
  isValid: boolean;
  structureScore: number;
  patternMatches: string[];
  missingElements: string[];
  recommendations: StructureRecommendation[];
}

export interface StructureRecommendation {
  type: 'structure' | 'navigation' | 'metadata' | 'content';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  example?: string;
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

  // Task 6.2: Template Compliance and Style Guide Enforcement Methods

  async validateTemplateCompliance(content: string, templateType: string): Promise<TemplateComplianceResult> {
    const violations: ComplianceViolation[] = [];
    const requiredSections = this.getRequiredSectionsForCompliance(templateType);
    
    // Check for required sections
    let structureScore = 100;
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        violations.push({
          type: 'structure',
          message: `Missing required section: ${section}`,
          severity: 'error',
          suggestion: `Add the ${section} section to your document`
        });
        structureScore -= 20;
      }
    }

    // Check content quality - only flag if very minimal
    let contentScore = 100;
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 20) {
      violations.push({
        type: 'content',
        message: 'Content is too brief for a comprehensive guide',
        severity: 'warning',
        suggestion: 'Add more detailed explanations and examples'
      });
      contentScore -= 30;
    }

    // Check formatting consistency - only flag if there are actually malformed headers  
    let formattingScore = 100;
    const inconsistentHeaders = content.match(/^#+\w/gm) || [];
    
    if (inconsistentHeaders.length > 0) {
      violations.push({
        type: 'formatting',
        message: 'Headers should have space after # symbols',
        severity: 'warning',
        suggestion: 'Add spaces after # in headers'
      });
      formattingScore -= 20;
    }

    const score = Math.max(0, (structureScore + contentScore + formattingScore) / 3);
    const isCompliant = violations.filter(v => v.severity === 'error').length === 0;

    return {
      isCompliant,
      score,
      violations,
      scoreBreakdown: {
        structureScore: Math.max(0, structureScore),
        contentScore: Math.max(0, contentScore),
        formattingScore: Math.max(0, formattingScore)
      }
    };
  }

  async validateStyleGuide(content: string): Promise<StyleGuideResult> {
    const violations: StyleViolation[] = [];
    const lines = content.split('\n');

    // Check header spacing - only add violations for headers without space
    lines.forEach((line, index) => {
      if (line.match(/^#+\w/)) {
        violations.push({
          type: 'formatting',
          rule: 'header-spacing',
          message: 'Headers should have consistent spacing',
          line: index + 1,
          severity: 'warning'
        });
      }
    });

    // Check heading hierarchy - process all headers including malformed ones
    const allHeaders = lines.map((line, index) => ({ line: line.trim(), index: index + 1 }))
      .filter(item => item.line.match(/^#+/));
    
    let lastLevel = 0;
    allHeaders.forEach(heading => {
      const level = (heading.line.match(/^#+/) || [''])[0].length;
      if (level > lastLevel + 1 && lastLevel > 0) {
        violations.push({
          type: 'structure',
          rule: 'heading-hierarchy',
          message: `Heading levels should not skip (h${lastLevel} -> h${level})`,
          line: heading.index,
          severity: 'error'
        });
      } else if (level < lastLevel && level !== 1) {
        violations.push({
          type: 'structure',
          rule: 'heading-hierarchy',
          message: 'Heading hierarchy out of order',
          line: heading.index,
          severity: 'warning'
        });
      }
      lastLevel = level;
    });

    // Check list formatting
    lines.forEach((line, index) => {
      if (line.match(/^-[^\s]/)) {
        violations.push({
          type: 'formatting',
          rule: 'list-spacing',
          message: 'List items should have space after marker',
          line: index + 1,
          severity: 'warning'
        });
      }
    });

    // Check list consistency
    const listLines = lines.map((line, index) => ({ line, index: index + 1 }))
      .filter(item => item.line.match(/^\s*[-*+]\s/));
    
    if (listLines.length > 0) {
      const markers = listLines.map(item => item.line.trim()[0]);
      const uniqueMarkers = [...new Set(markers)];
      
      if (uniqueMarkers.length > 1) {
        const firstInconsistentIndex = listLines.findIndex(item => 
          item.line.trim()[0] !== uniqueMarkers[0]
        );
        if (firstInconsistentIndex >= 0) {
          violations.push({
            type: 'formatting',
            rule: 'list-consistency',
            message: 'Use consistent list markers throughout document',
            line: listLines[firstInconsistentIndex].index,
            severity: 'suggestion'
          });
        }
      }
    }

    // Check code block formatting - only check opening fences without language
    lines.forEach((line, index) => {
      if (line.trim() === '```') {
        // Check if this is an opening fence (not a closing fence)
        const linesBefore = lines.slice(0, index);
        const fencesWithLanguage = linesBefore.filter(l => l.trim().startsWith('```') && l.trim().length > 3).length;
        const fencesWithoutLanguage = linesBefore.filter(l => l.trim() === '```').length;
        const totalFences = fencesWithLanguage + fencesWithoutLanguage;
        
        // If even number of fences before, this is an opening fence
        if (totalFences % 2 === 0) {
          violations.push({
            type: 'formatting',
            rule: 'code-block-language',
            message: 'Code blocks should specify language for syntax highlighting',
            line: index + 1,
            severity: 'warning'
          });
        }
      }
    });

    // Check for indented code blocks - only flag the first line of each block
    let inIndentedBlock = false;
    lines.forEach((line, index) => {
      const isIndentedCode = line.match(/^    [a-zA-Z\/]/);
      
      if (isIndentedCode && !inIndentedBlock) {
        violations.push({
          type: 'formatting',
          rule: 'code-block-style',
          message: 'Use fenced code blocks (```) instead of indented blocks',
          line: index + 1,
          severity: 'suggestion'
        });
        inIndentedBlock = true;
      } else if (!isIndentedCode && line.trim() === '') {
        // Empty line might end the indented block
        inIndentedBlock = false;
      } else if (!isIndentedCode && line.trim() !== '') {
        // Non-indented content definitely ends the block
        inIndentedBlock = false;
      }
    });

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const isValid = errorCount === 0;
    const score = Math.max(0, 100 - (violations.length * 10));

    return {
      violations,
      isValid,
      score
    };
  }

  async generateTemplateSuggestions(content: string, templateType: string): Promise<TemplateSuggestions> {
    const requiredSections = this.getRequiredSectionsForCompliance(templateType);
    const existingSections = this.extractExistingSections(content);
    const missingSections = requiredSections.filter(section => 
      !existingSections.some(existing => existing.toLowerCase().includes(section.replace('## ', '').toLowerCase()))
    );

    const corrections: TemplateCorrection[] = [];
    let correctedTemplate = content;

    // Add missing sections
    missingSections.forEach(section => {
      const sectionName = section.replace('## ', '');
      const templateContent = this.generateSectionTemplate(sectionName, templateType);
      corrections.push({
        type: 'add-section',
        section: sectionName,
        content: templateContent,
        position: correctedTemplate.length
      });
      correctedTemplate += `\n\n${templateContent}`;
    });

    const improvementScore = Math.max(0, 100 - (missingSections.length * 15));

    return {
      missingSections: missingSections.map(s => s.replace('## ', '')),
      corrections,
      correctedTemplate,
      improvementScore
    };
  }

  async autoCorrectFormatting(content: string): Promise<FormattingCorrections> {
    let correctedContent = content;
    const appliedFixes: string[] = [];

    // Fix header spacing
    if (correctedContent.match(/^#+[^\s]/gm)) {
      correctedContent = correctedContent.replace(/^(#+)([^\s])/gm, '$1 $2');
      appliedFixes.push('header-spacing');
    }

    // Fix list spacing
    if (correctedContent.match(/^-[^\s]/gm)) {
      correctedContent = correctedContent.replace(/^-([^\s])/gm, '- $1');
      appliedFixes.push('list-spacing');
    }

    // Add language to code blocks without language
    if (correctedContent.match(/^```\s*\n/gm)) {
      correctedContent = correctedContent.replace(/^```\s*\n/gm, '```text\n');
      appliedFixes.push('code-block-language');
    }

    return {
      correctedContent,
      appliedFixes,
      fixCount: appliedFixes.length
    };
  }

  async validateDocumentStructure(content: string, templateType: string): Promise<DocumentStructureResult> {
    const patternMatches: string[] = [];
    const missingElements: string[] = [];
    const recommendations: StructureRecommendation[] = [];

    // Check for required sections first (high priority)
    const requiredSections = this.getRequiredSectionsForCompliance(templateType);
    const hasAllRequired = requiredSections.every(section => content.includes(section));
    
    if (hasAllRequired) {
      patternMatches.push('required-sections');
    } else {
      missingElements.push('required-sections');
      recommendations.push({
        type: 'structure',
        priority: 'high',
        message: 'Add Prerequisites section before Installation',
        action: 'add-section'
      });
    }

    // Check for table of contents (medium priority)
    if (content.includes('## Table of Contents') || content.includes('# Table of Contents')) {
      patternMatches.push('has-toc');
    } else {
      missingElements.push('table-of-contents');
      recommendations.push({
        type: 'navigation',
        priority: 'medium',
        message: 'Add table of contents for better navigation',
        action: 'add-toc'
      });
    }

    // Check for frontmatter (medium priority)
    if (content.startsWith('---')) {
      patternMatches.push('has-frontmatter');
    } else {
      missingElements.push('frontmatter');
      recommendations.push({
        type: 'metadata',
        priority: 'medium',
        message: 'Add frontmatter with document metadata',
        action: 'add-frontmatter'
      });
    }

    // Check logical flow
    const overviewIndex = content.indexOf('## Overview');
    const installIndex = content.indexOf('## Installation');
    const usageIndex = content.indexOf('## Usage');
    
    if (overviewIndex < installIndex && installIndex < usageIndex) {
      patternMatches.push('logical-flow');
    }

    const structureScore = Math.max(0, (patternMatches.length / 4) * 100);
    const isValid = missingElements.length === 0;

    return {
      isValid,
      structureScore,
      patternMatches,
      missingElements,
      recommendations
    };
  }

  private getRequiredSectionsForCompliance(templateType: string): string[] {
    const sectionMap = {
      'onboarding-guide': ['## Overview', '## Prerequisites', '## Installation', '## Usage', '## Contributing'],
      'setup-guide': ['## Prerequisites', '## Installation', '## Configuration'],
      'user-guide': ['## Overview', '## Getting Started', '## Usage', '## Troubleshooting']
    };

    return sectionMap[templateType as keyof typeof sectionMap] || ['## Overview', '## Usage'];
  }

  private extractExistingSections(content: string): string[] {
    const headerMatches = content.match(/^#+\s+.+$/gm) || [];
    return headerMatches.map(header => header.trim());
  }

  private generateSectionTemplate(sectionName: string, templateType: string): string {
    const templates = {
      'Prerequisites': `## Prerequisites

Before getting started, ensure you have the following installed:

- Node.js 20+ 
- Git
- A code editor (VS Code recommended)`,
      'Installation': `## Installation

1. Clone the repository:
   \`\`\`bash
   git clone <repository-url>
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\``,
      'Usage': `## Usage

This section explains how to use the project effectively.

### Basic Usage

Provide basic usage examples here.

### Advanced Features

Document advanced features and configurations.`,
      'Contributing': `## Contributing

We welcome contributions! Please read our contributing guidelines before submitting changes.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request`
    };

    return templates[sectionName as keyof typeof templates] || `## ${sectionName}

Add content for ${sectionName} section here.`;
  }
}