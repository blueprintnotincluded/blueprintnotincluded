import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { 
  DocumentReference, 
  FileReferenceMap, 
  LinkValidationResult, 
  BrokenLink,
  ReferenceUpdateResult,
  LinkRepairSuggestion,
  DependencyMap,
  CircularDependency,
  ReferenceTrackingConfig,
  ExternalLinkStatus
} from '../types/link-tracking';

export class LinkTracker {
  private config: ReferenceTrackingConfig;
  private referenceMap: FileReferenceMap = {};
  private lastScanTimestamp?: Date;

  constructor(config: ReferenceTrackingConfig) {
    this.config = config;
  }

  /**
   * Extract all references from a single markdown file
   */
  async extractReferencesFromFile(filePath: string): Promise<DocumentReference[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const references: DocumentReference[] = [];
    const lines = content.split('\n');

    lines.forEach((line, lineIndex) => {
      let match;
      const regex = new RegExp(this.config.linkPatterns.markdown.source, 'g');
      
      while ((match = regex.exec(line)) !== null) {
        const linkText = match[1];
        const targetPath = match[2];
        const columnStart = match.index!;
        const columnEnd = match.index! + match[0].length;

        // Determine link type
        let type: DocumentReference['type'];
        let anchor: string | undefined;

        if (this.config.linkPatterns.external.test(targetPath)) {
          type = 'external';
        } else if (path.isAbsolute(targetPath)) {
          type = 'absolute';
        } else {
          type = 'relative';
        }

        // Extract anchor if present
        const anchorMatch = targetPath.match(/^([^#]+)#(.+)$/);
        if (anchorMatch) {
          anchor = anchorMatch[2];
        }

        const cleanTargetPath = anchorMatch ? anchorMatch[1] : targetPath;

        references.push({
          sourceFile: filePath,
          linkText,
          targetPath: cleanTargetPath,
          type,
          lineNumber: lineIndex + 1,
          columnStart,
          columnEnd,
          anchor,
          originalMatch: match[0]
        });
      }
    });

    return references;
  }

  /**
   * Build complete reference map for all files in the configured directory
   */
  async buildReferenceMap(): Promise<FileReferenceMap> {
    const files = await this.getMarkdownFiles();
    this.referenceMap = {};

    // First pass: collect all outbound references
    for (const file of files) {
      const outboundReferences = await this.extractReferencesFromFile(file);
      const stats = fs.statSync(file);
      const content = fs.readFileSync(file, 'utf8');
      const contentHash = crypto.createHash('md5').update(content).digest('hex');

      this.referenceMap[file] = {
        outboundReferences,
        inboundReferences: [],
        lastModified: stats.mtime,
        contentHash
      };
    }

    // Second pass: build inbound references
    for (const [sourceFile, data] of Object.entries(this.referenceMap)) {
      for (const reference of data.outboundReferences) {
        if (reference.type === 'relative') {
          const targetFile = this.resolveRelativePath(sourceFile, reference.targetPath);
          if (this.referenceMap[targetFile]) {
            this.referenceMap[targetFile].inboundReferences.push({
              ...reference,
              sourceFile
            });
          }
        }
      }
    }

    this.lastScanTimestamp = new Date();
    return this.referenceMap;
  }

  /**
   * Validate all links in the reference map
   */
  async validateAllLinks(): Promise<LinkValidationResult> {
    // Force rebuild to include any newly created files
    await this.buildReferenceMap();

    const startTime = Date.now();
    let totalLinks = 0;
    let validLinks = 0;
    const brokenLinks: BrokenLink[] = [];
    const externalLinks: ExternalLinkStatus[] = [];

    for (const [sourceFile, data] of Object.entries(this.referenceMap)) {
      for (const reference of data.outboundReferences) {
        totalLinks++;

        if (reference.type === 'external') {
          // For now, mark all external links as valid (TODO: implement HTTP checking)
          externalLinks.push({
            url: reference.targetPath,
            status: 'valid',
            lastChecked: new Date()
          });
          validLinks++;
        } else if (reference.type === 'relative') {
          const targetFile = this.resolveRelativePath(sourceFile, reference.targetPath);
          
          if (!fs.existsSync(targetFile)) {
            brokenLinks.push({
              sourceFile,
              linkText: reference.linkText,
              targetPath: reference.targetPath,
              lineNumber: reference.lineNumber,
              errorType: 'file_not_found',
              errorMessage: `File not found: ${targetFile}`
            });
          } else if (reference.anchor) {
            // TODO: Check if anchor exists in target file
            validLinks++;
          } else {
            validLinks++;
          }
        } else {
          validLinks++;
        }
      }
    }

    const validationDuration = Date.now() - startTime;

    return {
      totalLinks,
      validLinks,
      brokenLinks,
      externalLinks,
      checkTimestamp: new Date(),
      validationDuration
    };
  }

  /**
   * Update references when a file is moved
   */
  async updateReferencesForMovedFile(oldPath: string, newPath: string): Promise<ReferenceUpdateResult> {
    // Always rebuild to get the latest state
    await this.buildReferenceMap();

    const updatedFiles: string[] = [];
    const failedUpdates: Array<{ file: string; error: string }> = [];
    let totalUpdates = 0;

    // Find all files that reference the moved file
    for (const [sourceFile, data] of Object.entries(this.referenceMap)) {
      let fileUpdated = false;
      let content = fs.readFileSync(sourceFile, 'utf8');

      for (const reference of data.outboundReferences) {
        if (reference.type === 'relative') {
          const resolvedTarget = this.resolveRelativePath(sourceFile, reference.targetPath);
          
          if (path.resolve(resolvedTarget) === path.resolve(oldPath)) {
            // Calculate new relative path
            const newRelativePath = path.relative(path.dirname(sourceFile), newPath);
            
            // Replace the link in content
            const replacement = `[${reference.linkText}](${newRelativePath}${reference.anchor ? '#' + reference.anchor : ''})`;
            content = content.replace(reference.originalMatch, replacement);
            
            fileUpdated = true;
            totalUpdates++;
          }
        }
      }

      if (fileUpdated) {
        try {
          fs.writeFileSync(sourceFile, content);
          updatedFiles.push(sourceFile);
        } catch (error) {
          failedUpdates.push({
            file: sourceFile,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // Rebuild reference map after updates
    if (totalUpdates > 0) {
      await this.buildReferenceMap();
    }

    return {
      updatedFiles,
      totalUpdates,
      failedUpdates,
      backupCreated: false // TODO: implement backup
    };
  }

  /**
   * Suggest repairs for broken links
   */
  async suggestLinkRepairs(validationResult: LinkValidationResult): Promise<LinkRepairSuggestion[]> {
    const suggestions: LinkRepairSuggestion[] = [];
    const allFiles = await this.getMarkdownFiles();

    for (const brokenLink of validationResult.brokenLinks) {
      if (brokenLink.errorType === 'file_not_found') {
        // Try to find similar file names
        const targetFileName = path.basename(brokenLink.targetPath);
        const possibleMatches = allFiles.filter(file => {
          const fileName = path.basename(file);
          return this.calculateSimilarity(fileName, targetFileName) > 0.5; // Lower threshold
        });

        if (possibleMatches.length > 0) {
          // Sort by similarity and pick the best match
          const sortedMatches = possibleMatches.map(file => ({
            file,
            similarity: this.calculateSimilarity(path.basename(file), targetFileName)
          })).sort((a, b) => b.similarity - a.similarity);

          const bestMatch = sortedMatches[0].file;
          const relativePath = path.relative(
            path.dirname(brokenLink.sourceFile), 
            bestMatch
          );

          suggestions.push({
            brokenLink,
            suggestedTarget: relativePath,
            confidence: sortedMatches[0].similarity,
            repairType: 'file_rename',
            reasoning: `Found similar file: ${path.basename(bestMatch)} (${Math.round(sortedMatches[0].similarity * 100)}% similarity)`
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Analyze documentation dependencies
   */
  async analyzeDependencies(): Promise<DependencyMap> {
    if (Object.keys(this.referenceMap).length === 0) {
      await this.buildReferenceMap();
    }

    const dependencyMap: DependencyMap = {};

    for (const [filePath, data] of Object.entries(this.referenceMap)) {
      const dependencies: string[] = [];
      const dependents: string[] = [];

      // Get dependencies (files this file references)
      for (const reference of data.outboundReferences) {
        if (reference.type === 'relative') {
          const targetFile = this.resolveRelativePath(filePath, reference.targetPath);
          if (fs.existsSync(targetFile) && !dependencies.includes(targetFile)) {
            dependencies.push(targetFile);
          }
        }
      }

      // Get dependents (files that reference this file)
      for (const reference of data.inboundReferences) {
        if (!dependents.includes(reference.sourceFile)) {
          dependents.push(reference.sourceFile);
        }
      }

      dependencyMap[filePath] = {
        dependencies,
        dependents,
        depth: this.calculateDependencyDepth(filePath, dependencies),
        criticalPath: dependents.length > 3 // Simple heuristic
      };
    }

    return dependencyMap;
  }

  /**
   * Detect circular dependencies
   */
  async detectCircularDependencies(dependencyMap?: DependencyMap): Promise<CircularDependency[]> {
    if (!dependencyMap) {
      dependencyMap = await this.analyzeDependencies();
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const circularDependencies: CircularDependency[] = [];
    const seenCycles = new Set<string>();

    const dfs = (file: string, currentPath: string[]): void => {
      if (recursionStack.has(file)) {
        // Found a cycle
        const cycleStart = currentPath.indexOf(file);
        const cycle = [...currentPath.slice(cycleStart), file];
        
        // Create a normalized cycle key to avoid duplicates
        const sortedCycle = [...cycle].sort();
        const cycleKey = sortedCycle.join('|');
        
        if (!seenCycles.has(cycleKey)) {
          seenCycles.add(cycleKey);
          circularDependencies.push({
            cycle,
            severity: 'warning',
            description: `Circular dependency detected: ${cycle.map(f => path.basename(f)).join(' → ')}`
          });
        }
        return;
      }

      if (visited.has(file)) {
        return;
      }

      visited.add(file);
      recursionStack.add(file);

      const dependencies = dependencyMap![file]?.dependencies || [];
      for (const dependency of dependencies) {
        dfs(dependency, [...currentPath, file]);
      }

      recursionStack.delete(file);
    };

    for (const file of Object.keys(dependencyMap)) {
      if (!visited.has(file)) {
        dfs(file, []);
      }
    }

    return circularDependencies;
  }

  // Helper methods

  private async getMarkdownFiles(): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Check exclude patterns
          const relativePath = path.relative(this.config.baseDirectory, fullPath);
          const shouldExclude = this.config.excludePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
          });
          
          if (!shouldExclude) {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (this.config.fileExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    scanDirectory(this.config.baseDirectory);
    return files;
  }

  private resolveRelativePath(sourceFile: string, relativePath: string): string {
    const sourceDir = path.dirname(sourceFile);
    return path.resolve(sourceDir, relativePath);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : (maxLen - matrix[len1][len2]) / maxLen;
  }

  private calculateDependencyDepth(filePath: string, dependencies: string[]): number {
    // Simple implementation - just return the number of direct dependencies
    return dependencies.length;
  }
}