import * as fs from 'fs';
import grayMatter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { Result } from '../types';

export interface ParsedAgentsDocument {
  metadata: {
    title: string;
    type: string;
    lastModified?: Date;
    version?: string;
  };
  sections: { [key: string]: string };
  codeExamples: CodeExample[];
  commands: string[];
  technologies: string[];
  dependencies: string[];
  warnings: string[];
}

export interface CodeExample {
  language: string;
  code: string;
  section: string;
  line: number;
}

export class AgentsDocumentParser {
  private md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt();
  }

  async parseAgentsDocument(content: string): Promise<Result<ParsedAgentsDocument, Error>> {
    try {
      const { data: frontMatter, content: markdownContent } = grayMatter(content);
      
      const metadata = {
        title: frontMatter.title || 'AGENTS.md',
        type: frontMatter.type || 'agent-guidance',
        lastModified: frontMatter.lastModified ? new Date(frontMatter.lastModified) : undefined,
        version: frontMatter.version
      };

      const sections = this.extractSections(markdownContent);
      const codeExamples = this.extractCodeExamples(markdownContent);
      const commands = this.extractCommands(codeExamples);
      const technologies = this.extractTechnologies(markdownContent);
      const dependencies = this.extractDependencies(markdownContent);
      const warnings = this.validateStructure(sections);

      return {
        isSuccess: true,
        value: {
          metadata,
          sections,
          codeExamples,
          commands,
          technologies,
          dependencies,
          warnings
        }
      };
    } catch (error) {
      return {
        isSuccess: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private extractSections(content: string): { [key: string]: string } {
    const sections: { [key: string]: string } = {};
    // Normalize line endings to handle Windows (\r\n) and Unix (\n) formats
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedContent.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#+\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections[this.normalizeHeaderKey(currentSection)] = currentContent.join('\n').trim();
        }
        
        // Start new section
        currentSection = headerMatch[1];
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections[this.normalizeHeaderKey(currentSection)] = currentContent.join('\n').trim();
    }
    return sections;
  }

  private extractCodeExamples(content: string): CodeExample[] {
    const examples: CodeExample[] = [];
    const lines = content.split('\n');
    let currentSection = 'unknown';
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];
    let codeStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track current section
      const headerMatch = line.match(/^#+\s+(.+)$/);
      if (headerMatch) {
        currentSection = headerMatch[1].toLowerCase().replace(/\s+/g, '-');
      }

      // Detect code blocks
      const codeBlockMatch = line.match(/^```(\w+)?/);
      if (codeBlockMatch) {
        if (!inCodeBlock) {
          // Starting code block
          inCodeBlock = true;
          codeLanguage = codeBlockMatch[1] || 'text';
          codeLines = [];
          codeStartLine = i + 1;
        } else {
          // Ending code block
          inCodeBlock = false;
          if (codeLines.length > 0) {
            examples.push({
              language: codeLanguage,
              code: codeLines.join('\n'),
              section: currentSection,
              line: codeStartLine
            });
          }
        }
      } else if (inCodeBlock) {
        codeLines.push(line);
      }
    }

    return examples;
  }

  private extractCommands(codeExamples: CodeExample[]): string[] {
    const commands: string[] = [];
    
    for (const example of codeExamples) {
      if (example.language === 'bash' || example.language === 'shell') {
        const lines = example.code.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('export')) {
            commands.push(trimmed);
          }
        }
      }
    }

    return [...new Set(commands)]; // Remove duplicates
  }

  private extractTechnologies(content: string): string[] {
    const technologies: string[] = [];
    
    // Pattern 1: **Backend**: Express.js with TypeScript
    const keyValuePattern = /\*\*([^*]+)\*\*:\s*([^-\n]+)/g;
    let match;
    while ((match = keyValuePattern.exec(content)) !== null) {
      const techString = match[2].trim();
      // Split on "with", "and", commas, and extract individual technologies
      const techs = techString.split(/\s+with\s+|\s+and\s+|,\s*/).map(t => t.trim());
      technologies.push(...techs);
    }

    // Pattern 2: - **Testing**: Jest and Cypress
    const listKeyValuePattern = /-\s*\*\*([^*]+)\*\*:\s*([^-\n]+)/g;
    while ((match = listKeyValuePattern.exec(content)) !== null) {
      const techString = match[2].trim();
      const techs = techString.split(/\s+and\s+|,\s*/).map(t => t.trim());
      technologies.push(...techs);
    }

    // Pattern 3: - Express.js (simple list items)
    const simpleListPattern = /-\s*([A-Z][a-zA-Z0-9.]+(?:\s+[a-zA-Z0-9.]+)*)/g;
    while ((match = simpleListPattern.exec(content)) !== null) {
      const tech = match[1].trim();
      if (tech.length > 2 && /^[A-Z]/.test(tech) && !tech.includes(':')) {
        technologies.push(tech);
      }
    }

    return [...new Set(technologies)].filter(t => t.length > 2);
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const depPattern = /`([a-z][a-z0-9-]+)`/g;
    
    let match;
    while ((match = depPattern.exec(content)) !== null) {
      const dep = match[1];
      if (dep.length > 2 && !dep.includes(' ') && /^[a-z]/.test(dep)) {
        dependencies.push(dep);
      }
    }

    return [...new Set(dependencies)];
  }

  private validateStructure(sections: { [key: string]: string }): string[] {
    const warnings: string[] = [];
    const expectedSections = ['project-overview', 'architecture', 'development-commands'];
    
    const missingSections = expectedSections.filter(section => !sections[section]);
    if (missingSections.length > 0) {
      warnings.push(`incomplete structure - missing sections: ${missingSections.join(', ')}`);
    }

    if (Object.keys(sections).length < 3) {
      warnings.push('document appears to have minimal content structure');
    }

    return warnings;
  }

  private normalizeHeaderKey(header: string): string {
    return header.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}