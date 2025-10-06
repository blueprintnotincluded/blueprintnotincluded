export interface ValidationRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'suggestion';
  pattern?: RegExp;
  schema?: object;
  description: string;
}

export interface ValidationViolation {
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'suggestion';
  line?: number;
  column?: number;
  source?: string;
}

export interface ContentValidationResult {
  filePath: string;
  isValid: boolean;
  violations: ValidationViolation[];
  checkTimestamp: Date;
  validationDuration: number;
}

export interface DocumentFreshnessReport {
  filePath: string;
  isStale: boolean;
  lastModified: Date;
  lastUpdatedInFrontMatter?: Date;
  daysSinceUpdate: number;
  stalenessThresholdDays: number;
}

export interface ContentQualitySuggestion {
  type: 'content_gap' | 'structure' | 'readability' | 'style' | 'completeness';
  message: string;
  severity: 'error' | 'warning' | 'suggestion';
  line?: number;
}

export interface ContentQualityReport {
  filePath: string;
  readabilityScore: number;
  structureScore: number;
  completenessScore: number;
  overallScore: number;
  suggestions: ContentQualitySuggestion[];
  metrics: {
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    sectionCount: number;
    linkCount: number;
    codeBlockCount: number;
    averageSentenceLength: number;
    averageParagraphLength: number;
  };
}

export interface BatchValidationReport {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  fileResults: ContentValidationResult[];
  overallScore: number;
  generatedAt: Date;
}

export interface ContentValidationConfig {
  baseDirectory: string;
  rules: ValidationRule[];
  freshnessThresholdDays?: number;
  fileExtensions?: string[];
  excludePatterns?: string[];
}

export interface QualityAssessmentReport {
  filePath: string;
  metrics: {
    wordCount: number;
    sectionCount: number;
    linkCount: number;
    codeBlockCount: number;
  };
  recommendations: string[];
}