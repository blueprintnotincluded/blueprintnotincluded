import { Result } from '../types';

export interface EnhancementOptions {
  preserveCriticalSections?: string[];
  enhanceWithTemplates?: boolean;
  addMissingStructure?: boolean;
  addFrontmatter?: boolean;
  improveStructure?: boolean;
  addCodeBlocks?: boolean;
  enhanceNavigation?: boolean;
  preserveLinks?: boolean;
  validateReferences?: boolean;
  updateRelativePaths?: boolean;
}

export interface EnhancementResult {
  enhancedContent: string;
  preservedSections: string[];
  addedStructure: string[];
  improvements: string[];
  linkValidation?: LinkValidation;
  enhancementLog: string[];
}

export interface LinkValidation {
  validLinks: string[];
  brokenLinks: string[];
  updatedPaths: { [oldPath: string]: string };
}

export class ContentEnhancer {

  async preserveAndEnhance(
    content: string, 
    options: EnhancementOptions
  ): Promise<Result<EnhancementResult, Error>> {
    try {
      const enhancementLog: string[] = [];
      let enhancedContent = content;
      const preservedSections: string[] = [];
      const addedStructure: string[] = [];
      const improvements: string[] = [];

      enhancementLog.push('Starting content enhancement process');

      // Step 1: Preserve critical sections
      if (options.preserveCriticalSections) {
        const preservation = this.preserveCriticalSections(enhancedContent, options.preserveCriticalSections);
        preservedSections.push(...preservation.preserved);
        enhancementLog.push(`Preserved ${preservation.preserved.length} critical sections`);
      }

      // Step 2: Add frontmatter if requested
      if (options.addFrontmatter) {
        const frontmatterResult = this.addFrontmatter(enhancedContent);
        enhancedContent = frontmatterResult.content;
        if (frontmatterResult.added) {
          improvements.push('added-frontmatter');
          enhancementLog.push('Added frontmatter metadata');
        }
      }

      // Step 3: Improve structure
      if (options.improveStructure || options.addMissingStructure) {
        const structureResult = this.improveStructure(enhancedContent, options);
        enhancedContent = structureResult.content;
        addedStructure.push(...structureResult.addedSections);
        improvements.push(...structureResult.improvements);
        enhancementLog.push(`Added ${structureResult.addedSections.length} structural sections`);
      }

      // Step 4: Enhance code formatting
      if (options.addCodeBlocks) {
        const codeResult = this.enhanceCodeFormatting(enhancedContent);
        enhancedContent = codeResult.content;
        if (codeResult.enhanced) {
          improvements.push('enhanced-code-formatting');
          enhancementLog.push('Enhanced code block formatting');
        }
      }

      // Step 5: Add navigation
      if (options.enhanceNavigation) {
        const navResult = this.addNavigation(enhancedContent);
        enhancedContent = navResult.content;
        if (navResult.added) {
          improvements.push('added-navigation');
          addedStructure.push('## Table of Contents');
          enhancementLog.push('Added table of contents');
        }
      }

      // Step 6: Handle links and references
      let linkValidation: LinkValidation | undefined;
      if (options.preserveLinks || options.validateReferences) {
        const linkResult = this.processLinks(enhancedContent, options);
        enhancedContent = linkResult.content;
        linkValidation = linkResult.validation;
        enhancementLog.push(`Processed ${linkResult.validation.validLinks.length + linkResult.validation.brokenLinks.length} links`);
      }

      enhancementLog.push('Content enhancement completed successfully');

      return {
        isSuccess: true,
        value: {
          enhancedContent,
          preservedSections,
          addedStructure,
          improvements,
          linkValidation,
          enhancementLog
        }
      };
    } catch (error) {
      return {
        isSuccess: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private preserveCriticalSections(content: string, criticalSections: string[]): {
    preserved: string[];
    content: string;
  } {
    const preserved: string[] = [];
    
    for (const sectionName of criticalSections) {
      const sectionRegex = new RegExp(`##\\s+${sectionName}[\\s\\S]*?(?=##|$)`, 'i');
      const match = content.match(sectionRegex);
      
      if (match) {
        preserved.push(sectionName);
      }
    }

    return {
      preserved,
      content
    };
  }

  private addFrontmatter(content: string): { content: string; added: boolean } {
    if (content.startsWith('---')) {
      return { content, added: false };
    }

    const title = this.extractTitle(content) || 'Project Documentation';
    const frontmatter = `---
title: ${title}
type: documentation
enhanced: true
enhancementDate: ${new Date().toISOString().split('T')[0]}
---

`;

    return {
      content: frontmatter + content,
      added: true
    };
  }

  private improveStructure(content: string, options: EnhancementOptions): {
    content: string;
    addedSections: string[];
    improvements: string[];
  } {
    let enhancedContent = content;
    const addedSections: string[] = [];
    const improvements: string[] = [];

    // Check for missing prerequisites section
    if (!content.toLowerCase().includes('## prerequisites') && !content.toLowerCase().includes('## requirements')) {
      const prerequisitesSection = `

## Prerequisites

Before getting started, ensure you have the following installed:

- Node.js 20+
- Git
- A code editor (VS Code recommended)
`;

      // Insert after overview/intro but before installation
      const installationIndex = enhancedContent.toLowerCase().indexOf('## installation');
      if (installationIndex > -1) {
        enhancedContent = enhancedContent.slice(0, installationIndex) + 
                          prerequisitesSection + 
                          enhancedContent.slice(installationIndex);
      } else {
        // Add after first section
        const firstSectionEnd = enhancedContent.indexOf('\n## ', enhancedContent.indexOf('# '));
        if (firstSectionEnd > -1) {
          enhancedContent = enhancedContent.slice(0, firstSectionEnd) + 
                            prerequisitesSection + 
                            enhancedContent.slice(firstSectionEnd);
        } else {
          enhancedContent += prerequisitesSection;
        }
      }
      
      addedSections.push('## Prerequisites');
      improvements.push('improved-structure');
    }

    // Check for missing installation section
    if (!content.toLowerCase().includes('## installation') && !content.toLowerCase().includes('## setup')) {
      const installationSection = `

## Installation

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
   \`\`\`
`;

      enhancedContent += installationSection;
      addedSections.push('## Installation');
      improvements.push('improved-structure');
    }

    return {
      content: enhancedContent,
      addedSections,
      improvements
    };
  }

  private enhanceCodeFormatting(content: string): { content: string; enhanced: boolean } {
    let enhanced = false;
    let enhancedContent = content;

    // Find inline code references that should be code blocks
    const commandPattern = /(^|\n)([^`\n]*?)(npm run \w+|npm install|npm start|yarn \w+|git \w+)([^`\n]*?)($|\n)/g;
    
    enhancedContent = enhancedContent.replace(commandPattern, (match, start, before, command, after, end) => {
      // Don't modify if already in code block
      if (before.includes('`') || after.includes('`')) {
        return match;
      }

      enhanced = true;
      return `${start}${before}\`\`\`bash\n${command}\n\`\`\`${after}${end}`;
    });

    // Convert inline commands to proper code blocks
    const inlineCommandPattern = /(?:Start with:|Run:|Execute:)\s*([^`\n]+npm[^`\n]+)/g;
    enhancedContent = enhancedContent.replace(inlineCommandPattern, (match, command) => {
      enhanced = true;
      return `\n\`\`\`bash\n${command.trim()}\n\`\`\`\n`;
    });

    return {
      content: enhancedContent,
      enhanced
    };
  }

  private addNavigation(content: string): { content: string; added: boolean } {
    // Check if TOC already exists
    if (content.toLowerCase().includes('table of contents') || content.includes('- [')) {
      return { content, added: false };
    }

    // Extract headers for TOC
    const headers = this.extractHeaders(content);
    
    if (headers.length < 3) {
      return { content, added: false };
    }

    const tocLines = ['## Table of Contents', ''];
    for (const header of headers) {
      if (header.level > 1) { // Skip main title
        const indent = '  '.repeat(header.level - 2);
        const link = header.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
        tocLines.push(`${indent}- [${header.text}](#${link})`);
      }
    }
    tocLines.push('');

    // Insert TOC after first section
    const firstHeaderEnd = content.indexOf('\n', content.indexOf('# '));
    const insertPosition = content.indexOf('\n## ', firstHeaderEnd);
    
    if (insertPosition > -1) {
      const toc = tocLines.join('\n');
      const enhancedContent = content.slice(0, insertPosition) + '\n\n' + toc + content.slice(insertPosition);
      return { content: enhancedContent, added: true };
    }

    return { content, added: false };
  }

  private processLinks(content: string, options: EnhancementOptions): {
    content: string;
    validation: LinkValidation;
  } {
    const validLinks: string[] = [];
    const brokenLinks: string[] = [];
    const updatedPaths: { [oldPath: string]: string } = {};
    let processedContent = content;

    // Find all markdown links
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: Array<{ text: string; url: string; fullMatch: string }> = [];
    
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        fullMatch: match[0]
      });
    }

    // Process each link
    for (const link of links) {
      if (this.isValidLink(link.url)) {
        validLinks.push(link.url);
      } else {
        brokenLinks.push(link.url);
      }

      // Only update paths if preserveLinks is false or not set
      if (options.updateRelativePaths && !options.preserveLinks && link.url.startsWith('./')) {
        const updatedPath = this.updateRelativePath(link.url);
        if (updatedPath !== link.url) {
          updatedPaths[link.url] = updatedPath;
          const updatedLink = `[${link.text}](${updatedPath})`;
          processedContent = processedContent.replace(link.fullMatch, updatedLink);
        }
      }
      // For preserveLinks=true, we preserve all links as-is
    }

    return {
      content: processedContent,
      validation: {
        validLinks,
        brokenLinks,
        updatedPaths
      }
    };
  }

  private extractTitle(content: string): string | null {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1] : null;
  }

  private extractHeaders(content: string): Array<{ level: number; text: string }> {
    const headers: Array<{ level: number; text: string }> = [];
    const headerPattern = /^(#+)\s+(.+)$/gm;
    
    let match;
    while ((match = headerPattern.exec(content)) !== null) {
      headers.push({
        level: match[1].length,
        text: match[2]
      });
    }

    return headers;
  }

  private isValidLink(url: string): boolean {
    // Simplified validation - in real implementation would check file existence
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return true; // Assume external links are valid
    }
    
    if (url.startsWith('./') || url.startsWith('../')) {
      return true; // Assume relative links are valid for now
    }

    if (url.includes('app/') || url.includes('src/')) {
      return true; // Assume code references are valid
    }

    return false;
  }

  private updateRelativePath(path: string): string {
    // Simplified path updating - could be more sophisticated
    if (path.startsWith('./docs/')) {
      return path.replace('./docs/', './documentation/');
    }
    
    return path;
  }
}