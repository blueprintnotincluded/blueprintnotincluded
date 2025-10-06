import { Result } from '../types';

export interface DocumentationAnalysis {
  documentTypes: string[];
  integrationOpportunities: IntegrationOpportunity[];
  recommendations: AnalysisRecommendation[];
  duplications: ContentDuplication[];
  inconsistencies: ContentInconsistency[];
  patterns: ContentPattern[];
  qualityScore: number;
}

export interface IntegrationOpportunity {
  type: 'merge' | 'consolidate' | 'split' | 'enhance';
  sourceFiles: string[];
  targetFile: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedEffort: string;
}

export interface AnalysisRecommendation {
  type: 'consolidation' | 'enhancement' | 'restructure' | 'standardization';
  priority: 'high' | 'medium' | 'low';
  message: string;
  sourceFiles: string[];
  targetSection: string;
  impact?: string;
}

export interface ContentDuplication {
  type: 'exact' | 'similar' | 'partial';
  files: string[];
  content: string;
  similarity: number;
  recommendation: string;
}

export interface ContentInconsistency {
  type: 'command-variation' | 'terminology' | 'structure' | 'format';
  files: string[];
  issue: string;
  examples?: string[];
  suggestedResolution?: string;
}

export interface ContentPattern {
  type: 'prerequisites' | 'commands' | 'structure' | 'format';
  frequency: number;
  variations: string[];
  canonicalForm: string;
  files?: string[];
}

export class DocumentationAnalyzer {
  
  async analyzeExistingDocumentation(fileStructure: { [filePath: string]: string }): Promise<Result<DocumentationAnalysis, Error>> {
    try {
      const documentTypes = this.identifyDocumentTypes(fileStructure);
      const integrationOpportunities = this.identifyIntegrationOpportunities(fileStructure);
      const recommendations = this.generateRecommendations(fileStructure, integrationOpportunities);
      const duplications = this.detectDuplications(fileStructure);
      const inconsistencies = this.detectInconsistencies(fileStructure);
      const patterns = this.extractContentPatterns(fileStructure);
      const qualityScore = this.calculateQualityScore(fileStructure, duplications, inconsistencies);

      return {
        isSuccess: true,
        value: {
          documentTypes,
          integrationOpportunities,
          recommendations,
          duplications,
          inconsistencies,
          patterns,
          qualityScore
        }
      };
    } catch (error) {
      return {
        isSuccess: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private identifyDocumentTypes(fileStructure: { [filePath: string]: string }): string[] {
    const types: string[] = [];
    
    for (const filePath of Object.keys(fileStructure)) {
      const fileName = filePath.toLowerCase();
      
      if (fileName.includes('readme')) {
        types.push('readme');
      } else if (fileName.includes('contributing')) {
        types.push('contributing');
      } else if (fileName.includes('setup') || fileName.includes('install')) {
        types.push('setup-guide');
      } else if (fileName.includes('api')) {
        types.push('api-docs');
      } else if (fileName.includes('agents') || fileName.includes('claude')) {
        types.push('agent-guidance');
      } else if (fileName.includes('changelog')) {
        types.push('changelog');
      } else if (fileName.includes('license')) {
        types.push('license');
      } else if (filePath.startsWith('docs/')) {
        types.push('documentation');
      }
    }

    return [...new Set(types)];
  }

  private identifyIntegrationOpportunities(fileStructure: { [filePath: string]: string }): IntegrationOpportunity[] {
    const opportunities: IntegrationOpportunity[] = [];
    
    // Look for setup-related content that could be consolidated
    const setupFiles = Object.keys(fileStructure).filter(path => 
      path.toLowerCase().includes('setup') || 
      path.toLowerCase().includes('install') ||
      path.toLowerCase().includes('getting-started')
    );

    if (setupFiles.length > 0) {
      opportunities.push({
        type: 'consolidate',
        sourceFiles: setupFiles,
        targetFile: 'onboarding-guide.md',
        description: 'Consolidate multiple setup guides into unified onboarding',
        priority: 'high',
        estimatedEffort: '2-4 hours'
      });
    }

    // Look for README content that could enhance onboarding
    const readmeFile = Object.keys(fileStructure).find(path => 
      path.toLowerCase().includes('readme')
    );

    if (readmeFile) {
      const readmeContent = fileStructure[readmeFile];
      if (this.containsSetupInstructions(readmeContent)) {
        opportunities.push({
          type: 'merge',
          sourceFiles: [readmeFile],
          targetFile: 'onboarding-guide.md', 
          description: 'Extract setup instructions from README into dedicated onboarding guide',
          priority: 'medium',
          estimatedEffort: '1-2 hours'
        });
      }
    }

    // Look for documentation that could be enhanced
    const docsFiles = Object.keys(fileStructure).filter(path => 
      path.toLowerCase().includes('docs/') || path.toLowerCase().includes('api')
    );

    if (docsFiles.length > 0) {
      opportunities.push({
        type: 'enhance',
        sourceFiles: docsFiles,
        targetFile: 'enhanced-documentation.md',
        description: 'Enhance existing documentation with modern standards',
        priority: 'medium',
        estimatedEffort: '3-6 hours'
      });
    }

    return opportunities;
  }

  private generateRecommendations(
    fileStructure: { [filePath: string]: string }, 
    opportunities: IntegrationOpportunity[]
  ): AnalysisRecommendation[] {
    const recommendations: AnalysisRecommendation[] = [];

    // Generate specific recommendations for setup.md
    const setupFiles = Object.keys(fileStructure).filter(path => 
      path.toLowerCase().includes('setup.md')
    );
    
    if (setupFiles.length > 0) {
      recommendations.push({
        type: 'consolidation',
        priority: 'medium',
        message: 'Merge setup.md content into main onboarding guide',
        sourceFiles: setupFiles,
        targetSection: 'installation'
      });
    }

    // Generate recommendations based on opportunities
    for (const opportunity of opportunities) {
      if (opportunity.type === 'consolidate' && !setupFiles.includes(opportunity.sourceFiles[0])) {
        recommendations.push({
          type: 'consolidation',
          priority: opportunity.priority,
          message: opportunity.description,
          sourceFiles: opportunity.sourceFiles,
          targetSection: 'installation',
          impact: 'Reduces documentation fragmentation and improves user experience'
        });
      }
    }

    return recommendations;
  }

  private detectDuplications(fileStructure: { [filePath: string]: string }): ContentDuplication[] {
    const duplications: ContentDuplication[] = [];
    const files = Object.keys(fileStructure);

    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const content1 = fileStructure[files[i]];
        const content2 = fileStructure[files[j]];
        
        const similarity = this.calculateSimilarity(content1, content2);
        
        if (similarity > 0.7) {
          duplications.push({
            type: 'similar',
            files: [files[i], files[j]],
            content: this.findCommonContent(content1, content2),
            similarity,
            recommendation: 'Consider consolidating or cross-referencing these documents'
          });
        } else {
          // Check for command duplications specifically
          const commands1 = this.extractCommands(content1);
          const commands2 = this.extractCommands(content2);
          const commonCommands = commands1.filter(cmd => commands2.includes(cmd));
          
          if (commonCommands.length > 0) {
            duplications.push({
              type: 'partial',
              files: [files[i], files[j]],
              content: commonCommands[0],
              similarity,
              recommendation: 'Review for potential content reuse or standardization'
            });
          }
        }
      }
    }

    return duplications;
  }

  private detectInconsistencies(fileStructure: { [filePath: string]: string }): ContentInconsistency[] {
    const inconsistencies: ContentInconsistency[] = [];
    
    // Detect command variations
    const commandVariations = this.findCommandVariations(fileStructure);
    for (const variation of commandVariations) {
      inconsistencies.push({
        type: 'command-variation',
        files: variation.files,
        issue: variation.description
      });
    }

    // Detect terminology inconsistencies
    const termVariations = this.findTerminologyVariations(fileStructure);
    for (const variation of termVariations) {
      inconsistencies.push({
        type: 'terminology',
        files: variation.files,
        issue: `Inconsistent terminology: ${variation.terms.join(' vs ')}`,
        examples: variation.examples,
        suggestedResolution: `Use consistent term: ${variation.preferred}`
      });
    }

    return inconsistencies;
  }

  private extractContentPatterns(fileStructure: { [filePath: string]: string }): ContentPattern[] {
    const patterns: ContentPattern[] = [];
    
    // Extract prerequisite patterns
    const prerequisitePattern = this.extractPrerequisitePatterns(fileStructure);
    if (prerequisitePattern) {
      patterns.push(prerequisitePattern);
    }

    // Extract command patterns
    const commandPatterns = this.extractCommandPatterns(fileStructure);
    patterns.push(...commandPatterns);

    return patterns;
  }

  private calculateQualityScore(
    fileStructure: { [filePath: string]: string }, 
    duplications: ContentDuplication[], 
    inconsistencies: ContentInconsistency[]
  ): number {
    let score = 100;
    
    // Penalize for duplications
    score -= duplications.length * 10;
    
    // Penalize for inconsistencies
    score -= inconsistencies.length * 15;
    
    // Bonus for having key documentation types
    const hasReadme = Object.keys(fileStructure).some(path => path.toLowerCase().includes('readme'));
    const hasContributing = Object.keys(fileStructure).some(path => path.toLowerCase().includes('contributing'));
    const hasSetup = Object.keys(fileStructure).some(path => path.toLowerCase().includes('setup'));
    
    if (hasReadme) score += 5;
    if (hasContributing) score += 5;
    if (hasSetup) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }

  // Helper methods
  private containsSetupInstructions(content: string): boolean {
    const setupKeywords = ['install', 'setup', 'getting started', 'clone', 'npm install', 'yarn install'];
    const lowerContent = content.toLowerCase();
    return setupKeywords.some(keyword => lowerContent.includes(keyword));
  }

  private calculateSimilarity(content1: string, content2: string): number {
    const words1 = content1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = content2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = [...set1].filter(word => set2.has(word));
    const union = new Set([...set1, ...set2]);
    
    return intersection.length / union.size;
  }

  private findCommonContent(content1: string, content2: string): string {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    
    const commonLines = lines1.filter(line => 
      lines2.some(line2 => line.trim() === line2.trim())
    );
    
    return commonLines.slice(0, 3).join('\n');
  }

  private findCommonPhrases(content1: string, content2: string): string[] {
    const phrases1 = content1.split(/[.!?]\s+/);
    const phrases2 = content2.split(/[.!?]\s+/);
    
    return phrases1.filter(phrase => 
      phrases2.some(phrase2 => phrase.trim().toLowerCase() === phrase2.trim().toLowerCase())
    ).slice(0, 3);
  }

  private findCommandVariations(fileStructure: { [filePath: string]: string }): Array<{
    files: string[];
    commands: string[];
    description: string;
    preferred: string;
  }> {
    const variations: Array<{
      files: string[];
      commands: string[];
      description: string;
      preferred: string;
    }> = [];

    // Look for start/dev command variations
    const startCommandFiles: { [file: string]: string[] } = {};
    
    for (const [file, content] of Object.entries(fileStructure)) {
      const commands = this.extractCommands(content);
      // Look for specific npm commands as distinct commands, not in longer phrases
      const npmStart = /\bnpm start\b/.test(content);
      const npmRunDev = /\bnpm run dev\b/.test(content);
      
      const startCmds: string[] = [];
      if (npmStart) startCmds.push('npm start');
      if (npmRunDev) startCmds.push('npm run dev');
      
      // Only include files that have clear start/dev commands and aren't just mentioned in passing
      const hasSetupContext = content.toLowerCase().includes('setup') || content.toLowerCase().includes('installation');
      if (startCmds.length > 0 && hasSetupContext) {
        startCommandFiles[file] = startCmds;
      }
    }

    const allStartCommands = Object.values(startCommandFiles).flat();
    const uniqueCommands = [...new Set(allStartCommands)];
    
    if (uniqueCommands.length > 1) {
      variations.push({
        files: Object.keys(startCommandFiles),
        commands: uniqueCommands,
        description: `Different start commands: ${uniqueCommands.join(' vs ')}`,
        preferred: uniqueCommands[0]
      });
    }

    return variations;
  }

  private findTerminologyVariations(fileStructure: { [filePath: string]: string }): Array<{
    files: string[];
    terms: string[];
    examples: string[];
    preferred: string;
  }> {
    // Simplified implementation - could be expanded
    return [];
  }

  private extractCommands(content: string): string[] {
    const commands: string[] = [];
    
    // Extract from code blocks
    const codeBlockRegex = /```(?:bash|shell|sh)?\n([\s\S]*?)\n```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const codeContent = match[1];
      const lines = codeContent.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('export')) {
          commands.push(trimmed);
        }
      }
    }

    // Also extract npm/yarn commands from regular text
    const npmCommandRegex = /(npm\s+[a-z]+(?:\s+[a-z]+)*|yarn\s+[a-z]+)/g;
    while ((match = npmCommandRegex.exec(content)) !== null) {
      commands.push(match[1]);
    }

    return [...new Set(commands)]; // Remove duplicates
  }

  private extractPrerequisitePatterns(fileStructure: { [filePath: string]: string }): ContentPattern | null {
    const prerequisiteFiles: string[] = [];
    const variations: string[] = [];

    for (const [file, content] of Object.entries(fileStructure)) {
      const prereqMatch = content.match(/(?:prerequisites|requirements|before you start)[:\s\n]+([\s\S]*?)(?:\n##|\n#|$)/i);
      
      if (prereqMatch) {
        prerequisiteFiles.push(file);
        const nodeMatches = prereqMatch[1].match(/node\.?js\s+(\d+[\w\s+]*)/gi);
        if (nodeMatches) {
          variations.push(...nodeMatches);
        }
      }
    }

    if (variations.length > 0) {
      const cleanedVariations = [...new Set(variations)].map(v => v.trim());
      return {
        type: 'prerequisites',
        frequency: variations.length,
        variations: cleanedVariations,
        canonicalForm: 'Node.js 20+'
      };
    }

    return null;
  }

  private extractCommandPatterns(fileStructure: { [filePath: string]: string }): ContentPattern[] {
    // Simplified implementation
    return [];
  }
}