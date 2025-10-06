import { promises as fs } from 'fs';
import * as path from 'path';
import { ProjectMetadata, TechnologyStack, ArchitecturePattern, CodingStandards, ValidationResult } from './types/ProjectStructure';

export interface ProjectStructure {
  directories: string[];
  sourceFiles: string[];
  totalFiles: number;
}

export interface DependencyMap {
  dependencies: Record<string, DependencyInfo>;
  devDependencies: Record<string, DependencyInfo>;
}

export interface DependencyInfo {
  version: string;
  constraintType: 'exact' | 'caret' | 'tilde' | 'range';
}

export interface AgentContext {
  metadata: ProjectMetadata;
  structure: ProjectHierarchy;
  conventions: CodingStandards;
  schemaVersion: string;
}

export interface ProjectHierarchy {
  modules: Record<string, ModuleInfo>;
  relationships: ModuleRelationship[];
}

export interface ModuleInfo {
  path: string;
  exports: string[];
  imports: string[];
}

export interface ModuleRelationship {
  from: string;
  to: string;
  type: 'import' | 'require' | 'reference';
}

export class MetadataExtractor {
  private projectPath: string;
  private cache: Map<string, any> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Extract comprehensive project metadata
   */
  async extractProjectMetadata(): Promise<ProjectMetadata> {
    const cacheKey = 'project-metadata';
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      const technologies = await this.extractTechnologyStack(packageJson);
      const architecture = await this.extractArchitecture();
      const conventions = await this.extractCodingStandards();

      const metadata: ProjectMetadata = {
        name: packageJson.name || 'unknown',
        description: packageJson.description || '',
        version: packageJson.version || '0.0.0',
        technologies,
        architecture,
        conventions,
        lastUpdated: new Date().toISOString()
      };

      this.cache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      // Return minimal metadata if extraction fails
      const minimal: ProjectMetadata = {
        name: 'unknown',
        description: '',
        version: '0.0.0',
        technologies: {
          runtime: 'unknown',
          language: 'unknown',
          framework: 'unknown',
          dependencies: []
        },
        architecture: {
          pattern: 'unknown',
          description: '',
          components: []
        },
        conventions: {
          styleGuide: 'unknown',
          linting: [],
          formatting: 'unknown',
          testing: 'unknown'
        },
        lastUpdated: new Date().toISOString()
      };

      this.cache.set(cacheKey, minimal);
      return minimal;
    }
  }

  /**
   * Extract project directory structure and file information
   */
  async extractProjectStructure(): Promise<ProjectStructure> {
    const directories: string[] = [];
    const sourceFiles: string[] = [];
    let totalFiles = 0;

    try {
      const items = await fs.readdir(this.projectPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          directories.push(item.name);
          
          // Recursively count files in directories
          const subFiles = await this.countFilesInDirectory(path.join(this.projectPath, item.name));
          totalFiles += subFiles.total;
          sourceFiles.push(...subFiles.sourceFiles);
        } else if (item.isFile()) {
          totalFiles++;
          if (this.isSourceFile(item.name)) {
            sourceFiles.push(item.name);
          }
        }
      }
    } catch (error) {
      // Return empty structure if extraction fails
    }

    return {
      directories,
      sourceFiles,
      totalFiles
    };
  }

  /**
   * Validate metadata against schema
   */
  async validateMetadata(metadata: ProjectMetadata): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!metadata.name || metadata.name === 'unknown') {
      errors.push('Project name is required');
    }

    if (!metadata.version || !this.isValidVersion(metadata.version)) {
      errors.push('Valid version number is required');
    }

    if (!metadata.technologies || !metadata.technologies.language) {
      errors.push('Technology stack information is required');
    }

    if (!metadata.architecture || !metadata.architecture.pattern) {
      warnings.push('Architecture pattern not specified');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date()
    };
  }

  /**
   * Extract coding standards from project patterns
   */
  async extractCodingStandards(): Promise<CodingStandards> {
    const sourceFiles = await this.findSourceFiles();
    const naming = await this.analyzeNamingPatterns(sourceFiles);
    
    // Check for common linting and formatting tools
    const linting: string[] = [];
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.eslint) linting.push('eslint');
      if (deps.tslint) linting.push('tslint');
      if (deps.jshint) linting.push('jshint');
    } catch (error) {
      // Ignore errors
    }

    return {
      naming,
      styleGuide: this.detectStyleGuide(),
      linting,
      formatting: this.detectFormatter(),
      testing: this.detectTestFramework()
    };
  }

  /**
   * Extract project architecture patterns
   */
  async extractArchitecture(): Promise<ArchitecturePattern> {
    const directories = await this.getDirectoryStructure();
    
    // Also check for nested directories in src/
    const srcPath = path.join(this.projectPath, 'src');
    let nestedDirectories: string[] = [];
    try {
      const srcItems = await fs.readdir(srcPath, { withFileTypes: true });
      nestedDirectories = srcItems.filter(item => item.isDirectory()).map(item => item.name);
    } catch (error) {
      // src directory doesn't exist, ignore
    }
    
    const allDirectories = [...directories, ...nestedDirectories];
    const pattern = this.detectArchitecturePattern(allDirectories);
    const components = this.extractArchitecturalComponents(allDirectories);

    return {
      pattern,
      description: this.getArchitectureDescription(pattern),
      components
    };
  }

  /**
   * Extract dependency mapping with version constraints
   */
  async extractDependencyMap(): Promise<DependencyMap> {
    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      const dependencies = this.parseDependencies(packageJson.dependencies || {});
      const devDependencies = this.parseDependencies(packageJson.devDependencies || {});

      return { dependencies, devDependencies };
    } catch (error) {
      return { dependencies: {}, devDependencies: {} };
    }
  }

  /**
   * Generate structured context for AI agents
   */
  async generateAgentContext(): Promise<AgentContext> {
    const metadata = await this.extractProjectMetadata();
    const structure = await this.extractProjectHierarchy();
    const conventions = await this.extractCodingStandards();

    return {
      metadata,
      structure,
      conventions,
      schemaVersion: '1.0.0'
    };
  }

  /**
   * Extract project hierarchy and module relationships
   */
  async extractProjectHierarchy(): Promise<ProjectHierarchy> {
    const modules: Record<string, ModuleInfo> = {};
    const relationships: ModuleRelationship[] = [];

    try {
      const srcPath = path.join(this.projectPath, 'src');
      const moduleFiles = await this.findModuleFiles(srcPath);

      for (const filePath of moduleFiles) {
        const moduleName = this.getModuleName(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        
        const exports = this.extractExports(content);
        const imports = this.extractImports(content);

        modules[moduleName] = {
          path: filePath,
          exports,
          imports
        };

        // Create relationships based on imports
        for (const importPath of imports) {
          const targetModule = this.resolveModuleName(importPath);
          if (targetModule) {
            relationships.push({
              from: moduleName,
              to: targetModule,
              type: 'import'
            });
          }
        }
      }
    } catch (error) {
      // Return empty hierarchy if extraction fails
    }

    return { modules, relationships };
  }

  /**
   * Validate agent context against schema
   */
  async validateAgentContext(context: AgentContext): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!context.metadata || !context.metadata.name) {
      errors.push('Agent context must include valid metadata');
    }

    if (!context.structure) {
      errors.push('Agent context must include project structure');
    }

    if (!context.conventions) {
      errors.push('Agent context must include coding conventions');
    }

    if (!context.schemaVersion || !this.isValidVersion(context.schemaVersion)) {
      errors.push('Agent context must include valid schema version');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
      timestamp: new Date()
    };
  }

  // Private helper methods

  private async extractTechnologyStack(packageJson: any): Promise<TechnologyStack> {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const dependencies = Object.keys(deps);

    let runtime = 'unknown';
    let language = 'unknown';
    let framework = 'unknown';

    // Detect runtime
    if (packageJson.engines?.node) runtime = 'Node.js';

    // Detect language
    if (deps.typescript || await this.hasTypeScriptFiles()) language = 'TypeScript';
    else if (await this.hasJavaScriptFiles()) language = 'JavaScript';

    // Detect framework
    if (deps.express) framework = 'Express';
    else if (deps.react) framework = 'React';
    else if (deps.angular) framework = 'Angular';
    else if (deps.vue) framework = 'Vue';

    return {
      runtime,
      language,
      framework,
      dependencies
    };
  }

  private async countFilesInDirectory(dirPath: string): Promise<{ total: number; sourceFiles: string[] }> {
    let total = 0;
    const sourceFiles: string[] = [];

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          const subCount = await this.countFilesInDirectory(path.join(dirPath, item.name));
          total += subCount.total;
          sourceFiles.push(...subCount.sourceFiles);
        } else if (item.isFile()) {
          total++;
          if (this.isSourceFile(item.name)) {
            sourceFiles.push(path.join(dirPath, item.name));
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return { total, sourceFiles };
  }

  private isSourceFile(filename: string): boolean {
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs'];
    return extensions.some(ext => filename.endsWith(ext));
  }

  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+/.test(version);
  }

  private async findSourceFiles(): Promise<string[]> {
    const structure = await this.extractProjectStructure();
    return structure.sourceFiles;
  }

  private async analyzeNamingPatterns(files: string[]): Promise<NamingConventions> {
    const patterns: NamingConventions = {
      files: 'camelCase',
      variables: 'camelCase',
      classes: 'PascalCase',
      functions: 'camelCase',
      directories: 'camelCase'
    };

    // Analyze file names to detect patterns
    for (const file of files) {
      const basename = path.basename(file, path.extname(file));
      if (this.isPascalCase(basename)) {
        patterns.files = 'PascalCase';
        break;
      } else if (this.isKebabCase(basename)) {
        patterns.files = 'kebab-case';
        break;
      }
    }

    return patterns;
  }

  private isPascalCase(str: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(str);
  }

  private isKebabCase(str: string): boolean {
    return /^[a-z][a-z0-9-]*$/.test(str);
  }

  private detectStyleGuide(): string {
    // Check for common style guide indicators
    return 'TypeScript Standard';
  }

  private detectFormatter(): string {
    // Check for formatter configuration
    return 'prettier';
  }

  private detectTestFramework(): string {
    // Check for test framework dependencies
    return 'jest';
  }

  private async getDirectoryStructure(): Promise<string[]> {
    const structure = await this.extractProjectStructure();
    return structure.directories;
  }

  private detectArchitecturePattern(directories: string[]): string {
    // Check for MVC pattern - can include either views or services as the "view" layer
    if (directories.includes('controllers') && directories.includes('models') && (directories.includes('views') || directories.includes('services'))) {
      return 'mvc';
    }
    if (directories.includes('services') && directories.includes('repositories')) {
      return 'layered';
    }
    return 'unknown';
  }

  private extractArchitecturalComponents(directories: string[]): string[] {
    const components: string[] = [];
    
    if (directories.includes('controllers')) components.push('controller');
    if (directories.includes('services')) components.push('service');
    if (directories.includes('models')) components.push('model');
    if (directories.includes('repositories')) components.push('repository');
    if (directories.includes('middleware')) components.push('middleware');
    if (directories.includes('views')) components.push('view');

    return components;
  }

  private getArchitectureDescription(pattern: string): string {
    const descriptions: Record<string, string> = {
      'mvc': 'Model-View-Controller architecture pattern',
      'layered': 'Layered architecture with clear separation of concerns',
      'microservices': 'Microservices architecture with distributed components',
      'unknown': 'Architecture pattern not clearly identified'
    };

    return descriptions[pattern] || descriptions['unknown'];
  }

  private parseDependencies(deps: Record<string, string>): Record<string, DependencyInfo> {
    const result: Record<string, DependencyInfo> = {};

    for (const [name, version] of Object.entries(deps)) {
      result[name] = {
        version,
        constraintType: this.getConstraintType(version)
      };
    }

    return result;
  }

  private getConstraintType(version: string): 'exact' | 'caret' | 'tilde' | 'range' {
    if (version.startsWith('^')) return 'caret';
    if (version.startsWith('~')) return 'tilde';
    if (version.includes('-') || version.includes('>') || version.includes('<')) return 'range';
    return 'exact';
  }

  private async findModuleFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await fs.readdir(directory, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isDirectory()) {
          const subFiles = await this.findModuleFiles(path.join(directory, item.name));
          files.push(...subFiles);
        } else if (item.isFile() && this.isSourceFile(item.name)) {
          files.push(path.join(directory, item.name));
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return files;
  }

  private getModuleName(filePath: string): string {
    const relativePath = path.relative(this.projectPath, filePath);
    const parts = relativePath.split(path.sep);
    
    // Get the directory name that represents the module
    if (parts.length > 2 && parts[0] === 'src' && parts[1] === 'modules') {
      return parts[2];
    }
    
    return path.basename(filePath, path.extname(filePath));
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
    
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  private resolveModuleName(importPath: string): string | null {
    // Simple resolution - extract module name from relative paths
    if (importPath.startsWith('../')) {
      const parts = importPath.split('/');
      return parts[parts.length - 1];
    }
    return null;
  }

  private async hasTypeScriptFiles(): Promise<boolean> {
    try {
      const files = await this.findSourceFiles();
      return files.some(file => file.endsWith('.ts') || file.endsWith('.tsx'));
    } catch {
      return false;
    }
  }

  private async hasJavaScriptFiles(): Promise<boolean> {
    try {
      const files = await this.findSourceFiles();
      return files.some(file => file.endsWith('.js') || file.endsWith('.jsx'));
    } catch {
      return false;
    }
  }
}