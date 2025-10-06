import { ChangeRelevanceAnalysis, DocumentationTask } from '../types';

export class FilePatternAnalyzer {
  private static readonly DOCUMENTATION_PATTERNS = [
    /\.md$/,
    /README/i,
    /AGENTS/i,
    /docs\//,
    /documentation\//
  ];

  private static readonly API_PATTERNS = [
    /\/api\//,
    /\/controllers?\//,
    /\/routes?\//,
    /\/endpoints?\//
  ];

  private static readonly MODEL_PATTERNS = [
    /\/models?\//,
    /\/schemas?\//,
    /\/entities?\//
  ];

  private static readonly SERVICE_PATTERNS = [
    /\/services?\//,
    /\/business\//,
    /\/logic\//
  ];

  private static readonly COMPONENT_PATTERNS = [
    /\/components?\//,
    /\/views?\//,
    /\/pages?\//
  ];

  private static readonly CONFIG_PATTERNS = [
    /package\.json$/,
    /tsconfig\.json$/,
    /\.env/,
    /config\//,
    /\.config\./
  ];

  /**
   * Categorizes files based on their patterns
   */
  static categorizeFiles(files: string[]): {
    documentation: string[];
    api: string[];
    models: string[];
    services: string[];
    components: string[];
    config: string[];
    other: string[];
  } {
    const result = {
      documentation: [] as string[],
      api: [] as string[],
      models: [] as string[],
      services: [] as string[],
      components: [] as string[],
      config: [] as string[],
      other: [] as string[]
    };

    files.forEach(file => {
      if (this.matchesPatterns(file, this.DOCUMENTATION_PATTERNS)) {
        result.documentation.push(file);
      } else if (this.matchesPatterns(file, this.API_PATTERNS)) {
        result.api.push(file);
      } else if (this.matchesPatterns(file, this.MODEL_PATTERNS)) {
        result.models.push(file);
      } else if (this.matchesPatterns(file, this.SERVICE_PATTERNS)) {
        result.services.push(file);
      } else if (this.matchesPatterns(file, this.COMPONENT_PATTERNS)) {
        result.components.push(file);
      } else if (this.matchesPatterns(file, this.CONFIG_PATTERNS)) {
        result.config.push(file);
      } else {
        result.other.push(file);
      }
    });

    return result;
  }

  /**
   * Analyzes the relevance of changes for documentation updates
   */
  static analyzeChangeRelevance(changedFiles: string[]): ChangeRelevanceAnalysis {
    const categorized = this.categorizeFiles(changedFiles);
    
    let changeCategory: 'documentation' | 'code' | 'config' | 'mixed' = 'mixed';
    
    const hasDocChanges = categorized.documentation.length > 0;
    const hasCodeChanges = categorized.api.length > 0 || categorized.models.length > 0 || categorized.services.length > 0;
    const hasConfigChanges = categorized.config.length > 0;

    if (hasDocChanges && !hasCodeChanges && !hasConfigChanges) {
      changeCategory = 'documentation';
    } else if (hasCodeChanges && !hasDocChanges && !hasConfigChanges) {
      changeCategory = 'code';
    } else if (hasConfigChanges && !hasCodeChanges && !hasDocChanges) {
      changeCategory = 'config';
    }

    // Determine if documentation update is required
    const requiresUpdate = categorized.api.length > 0 || 
                          categorized.models.length > 0 || 
                          (categorized.services.length > 0 && categorized.api.length === 0);

    // Determine priority based on impact
    let priority: 'high' | 'medium' | 'low' = 'low';
    if (categorized.api.length > 0 || categorized.models.length > 0) {
      priority = 'high';
    } else if (categorized.services.length > 0 || categorized.components.length > 0) {
      priority = 'medium';
    }

    return {
      requiresDocumentationUpdate: requiresUpdate,
      affectedDocuments: this.getAffectedDocuments(categorized),
      changeCategory,
      priority
    };
  }

  /**
   * Generates documentation tasks based on file changes
   */
  static generateDocumentationTasks(changedFiles: string[]): DocumentationTask[] {
    const categorized = this.categorizeFiles(changedFiles);
    const tasks: DocumentationTask[] = [];

    if (categorized.models.length > 0) {
      tasks.push({
        id: 'api-schema-update',
        type: 'api-schema-update',
        description: 'Update API schema documentation for model changes',
        files: categorized.models,
        priority: 'high',
        estimatedTime: 30
      });
    }

    if (categorized.api.length > 0) {
      tasks.push({
        id: 'api-endpoints-update',
        type: 'api-schema-update',
        description: 'Update API endpoint documentation',
        files: categorized.api,
        priority: 'high',
        estimatedTime: 45
      });
    }

    if (categorized.services.length > 0) {
      tasks.push({
        id: 'architecture-docs',
        type: 'architecture-documentation',
        description: 'Update architecture documentation for service changes',
        files: categorized.services,
        priority: 'medium',
        estimatedTime: 45
      });
    }

    if (categorized.components.length > 0) {
      tasks.push({
        id: 'component-examples',
        type: 'example-update',
        description: 'Update component usage examples',
        files: categorized.components,
        priority: 'medium',
        estimatedTime: 20
      });
    }

    return tasks;
  }

  private static matchesPatterns(file: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(file));
  }

  private static getAffectedDocuments(categorized: ReturnType<typeof this.categorizeFiles>): string[] {
    const affected: string[] = [];

    if (categorized.api.length > 0 || categorized.models.length > 0) {
      affected.push('AGENTS.md', 'API.md');
    }

    if (categorized.services.length > 0) {
      affected.push('AGENTS.md', 'ARCHITECTURE.md');
    }

    if (categorized.components.length > 0) {
      affected.push('README.md', 'COMPONENTS.md');
    }

    if (categorized.config.length > 0) {
      affected.push('README.md', 'SETUP.md');
    }

    // Always include main documentation files as fallback
    if (affected.length === 0) {
      affected.push('AGENTS.md', 'README.md');
    }

    // Remove duplicates
    return [...new Set(affected)];
  }
}