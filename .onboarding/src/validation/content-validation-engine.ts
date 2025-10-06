import * as fs from 'fs';
import * as path from 'path';
import grayMatter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import Ajv from 'ajv';
import {
  ValidationRule,
  ContentValidationResult,
  DocumentFreshnessReport,
  ContentQualityReport,
  BatchValidationReport,
  ContentValidationConfig,
  QualityAssessmentReport,
  ValidationViolation,
  ContentQualitySuggestion
} from '../types/content-validation';

// Constants
const DEFAULT_FRESHNESS_THRESHOLD_DAYS = 90;
const DEFAULT_FILE_EXTENSIONS = ['.md', '.markdown'];
const DEFAULT_EXCLUDE_PATTERNS = ['node_modules/**', '.git/**'];
const REQUIRED_SECTIONS = ['Overview', 'Setup', 'Usage'];

// Scoring constants
const OPTIMAL_SENTENCE_LENGTH = 15;
const SENTENCE_LENGTH_PENALTY = 2;
const SECTION_SCORE_MULTIPLIER = 20;
const WORD_COUNT_THRESHOLD = 50;

export class ContentValidationEngine {
  private config: ContentValidationConfig;
  private rules: Map<string, ValidationRule> = new Map();
  private ajv: Ajv;
  private md: MarkdownIt;

  constructor(config: ContentValidationConfig) {
    this.config = {
      freshnessThresholdDays: DEFAULT_FRESHNESS_THRESHOLD_DAYS,
      fileExtensions: DEFAULT_FILE_EXTENSIONS,
      excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
      ...config
    };
    
    this.ajv = new Ajv({ allErrors: true });
    this.md = new MarkdownIt();
    
    // Add initial rules
    config.rules.forEach(rule => this.addRule(rule));
  }

  addRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
  }

  async validateFile(filePath: string): Promise<ContentValidationResult> {
    const startTime = Date.now();
    const violations: ValidationViolation[] = [];

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontMatter, content: markdownContent } = grayMatter(content);

    // Apply all rules
    for (const rule of this.rules.values()) {
      try {
        const ruleViolations = await this.applyRule(rule, content, markdownContent, frontMatter, filePath);
        violations.push(...ruleViolations);
      } catch (error) {
        violations.push({
          ruleId: rule.id,
          message: `Rule application failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error'
        });
      }
    }

    const validationDuration = Date.now() - startTime;

    return {
      filePath,
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      checkTimestamp: new Date(),
      validationDuration
    };
  }

  private async applyRule(
    rule: ValidationRule, 
    fullContent: string, 
    markdownContent: string, 
    frontMatter: any, 
    filePath: string
  ): Promise<ValidationViolation[]> {
    const violations: ValidationViolation[] = [];

    if (rule.pattern) {
      violations.push(...this.applyPatternRule(rule, fullContent, markdownContent));
    }

    if (rule.schema) {
      violations.push(...this.applySchemaRule(rule, frontMatter));
    }

    return violations;
  }

  private applyPatternRule(rule: ValidationRule, fullContent: string, markdownContent: string): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (rule.id === 'required-sections') {
      violations.push(...this.validateRequiredSections(rule, markdownContent));
    } else {
      const matches = fullContent.match(rule.pattern!);
      if (!matches) {
        violations.push({
          ruleId: rule.id,
          message: rule.description,
          severity: rule.severity
        });
      }
    }

    return violations;
  }

  private validateRequiredSections(rule: ValidationRule, markdownContent: string): ValidationViolation[] {
    const violations: ValidationViolation[] = [];
    const matches = markdownContent.match(rule.pattern!);
    const foundSections = matches ? matches.map(m => m.replace(/^#+\s+/, '')) : [];
    
    const missingSections = REQUIRED_SECTIONS.filter(section => 
      !foundSections.some(found => found.toLowerCase().includes(section.toLowerCase()))
    );

    if (missingSections.length > 0) {
      violations.push({
        ruleId: rule.id,
        message: `Missing required sections: ${missingSections.join(', ')}`,
        severity: rule.severity
      });
    }

    return violations;
  }

  private applySchemaRule(rule: ValidationRule, frontMatter: any): ValidationViolation[] {
    const violations: ValidationViolation[] = [];

    if (rule.id === 'frontmatter-schema') {
      const valid = this.ajv.validate(rule.schema!, frontMatter);
      if (!valid) {
        const errors = this.ajv.errors || [];
        errors.forEach(error => {
          violations.push({
            ruleId: rule.id,
            message: `Front matter validation error: ${error.instancePath} ${error.message}`,
            severity: rule.severity
          });
        });
      }
    }

    return violations;
  }

  async checkDocumentFreshness(filePath: string): Promise<DocumentFreshnessReport> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontMatter } = grayMatter(content);

    const lastModified = stats.mtime;
    const lastUpdatedInFrontMatter = frontMatter.lastUpdated ? new Date(frontMatter.lastUpdated) : undefined;
    
    const relevantDate = lastUpdatedInFrontMatter || lastModified;
    const daysSinceUpdate = Math.floor((Date.now() - relevantDate.getTime()) / (1000 * 60 * 60 * 24));
    const stalenessThresholdDays = this.config.freshnessThresholdDays || 90;

    return {
      filePath,
      isStale: daysSinceUpdate > stalenessThresholdDays,
      lastModified,
      lastUpdatedInFrontMatter,
      daysSinceUpdate,
      stalenessThresholdDays
    };
  }

  async assessContentQuality(filePath: string): Promise<ContentQualityReport> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const { content: markdownContent } = grayMatter(content);

    // Parse the markdown content
    const tokens = this.md.parse(markdownContent, {});
    
    // Calculate metrics
    const words = markdownContent.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    const sentences = markdownContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = markdownContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Count sections (headings)
    const sections = (markdownContent.match(/^#+\s+.+$/gm) || []);
    
    // Count links and code blocks
    const links = (markdownContent.match(/\[([^\]]+)\]\([^)]+\)/g) || []);
    const codeBlocks = (markdownContent.match(/```[\s\S]*?```/g) || []);

    const metrics = {
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      sectionCount: sections.length,
      linkCount: links.length,
      codeBlockCount: codeBlocks.length,
      averageSentenceLength: words.length / sentences.length || 0,
      averageParagraphLength: words.length / paragraphs.length || 0
    };

    // Calculate scores using constants
    const scores = this.calculateQualityScores(metrics);
    const { readabilityScore, structureScore, completenessScore, overallScore } = scores;

    // Generate suggestions
    const suggestions: ContentQualitySuggestion[] = [];
    
    if (metrics.wordCount < 200) {
      suggestions.push({
        type: 'content_gap',
        message: 'Consider adding more detailed examples',
        severity: 'suggestion',
        line: undefined
      });
    }

    if (metrics.sectionCount < 3) {
      suggestions.push({
        type: 'structure',
        message: 'Consider organizing content into more sections',
        severity: 'suggestion',
        line: undefined
      });
    }

    if (metrics.codeBlockCount === 0 && filePath.includes('tutorial')) {
      suggestions.push({
        type: 'completeness',
        message: 'Consider adding code examples for better understanding',
        severity: 'suggestion',
        line: undefined
      });
    }

    return {
      filePath,
      readabilityScore,
      structureScore,
      completenessScore,
      overallScore,
      suggestions,
      metrics
    };
  }

  async validateDirectory(directoryPath: string): Promise<BatchValidationReport> {
    const files = await this.getMarkdownFiles(directoryPath);
    const fileResults: ContentValidationResult[] = [];

    for (const file of files) {
      try {
        const result = await this.validateFile(file);
        fileResults.push(result);
      } catch (error) {
        // Add error result for files that couldn't be validated
        fileResults.push({
          filePath: file,
          isValid: false,
          violations: [{
            ruleId: 'validation-error',
            message: `Failed to validate file: ${error instanceof Error ? error.message : String(error)}`,
            severity: 'error'
          }],
          checkTimestamp: new Date(),
          validationDuration: 0
        });
      }
    }

    const validFiles = fileResults.filter(r => r.isValid).length;
    const invalidFiles = fileResults.length - validFiles;
    const overallScore = fileResults.length > 0 ? (validFiles / fileResults.length) * 100 : 0;

    return {
      totalFiles: fileResults.length,
      validFiles,
      invalidFiles,
      fileResults,
      overallScore,
      generatedAt: new Date()
    };
  }

  async generateQualityReport(filePath: string): Promise<QualityAssessmentReport> {
    const qualityReport = await this.assessContentQuality(filePath);
    
    const recommendations: string[] = [];
    
    if (qualityReport.readabilityScore < 60) {
      recommendations.push('Consider simplifying sentence structure for better readability');
    }
    
    if (qualityReport.structureScore < 60) {
      recommendations.push('Add more section headings to improve document structure');
    }
    
    if (qualityReport.completenessScore < 60) {
      recommendations.push('Consider expanding the content with more detailed information');
    }

    return {
      filePath,
      metrics: {
        wordCount: qualityReport.metrics.wordCount,
        sectionCount: qualityReport.metrics.sectionCount,
        linkCount: qualityReport.metrics.linkCount,
        codeBlockCount: qualityReport.metrics.codeBlockCount
      },
      recommendations
    };
  }

  private async getMarkdownFiles(directoryPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Check exclude patterns
          const relativePath = path.relative(directoryPath, fullPath);
          const shouldExclude = this.config.excludePatterns?.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
          });
          
          if (!shouldExclude) {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (this.config.fileExtensions?.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    scanDirectory(directoryPath);
    return files;
  }

  private calculateQualityScores(metrics: any): {
    readabilityScore: number;
    structureScore: number;
    completenessScore: number;
    overallScore: number;
  } {
    const readabilityScore = Math.max(0, Math.min(100, 
      100 - (metrics.averageSentenceLength - OPTIMAL_SENTENCE_LENGTH) * SENTENCE_LENGTH_PENALTY
    ));
    
    const structureScore = Math.min(100, metrics.sectionCount * SECTION_SCORE_MULTIPLIER);
    const completenessScore = Math.min(100, metrics.wordCount / WORD_COUNT_THRESHOLD);
    const overallScore = (readabilityScore + structureScore + completenessScore) / 3;

    return {
      readabilityScore,
      structureScore,
      completenessScore,
      overallScore
    };
  }
}