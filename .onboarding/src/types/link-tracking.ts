export interface DocumentReference {
  sourceFile: string;
  linkText: string;
  targetPath: string;
  type: 'relative' | 'absolute' | 'external' | 'anchor';
  lineNumber: number;
  columnStart: number;
  columnEnd: number;
  anchor?: string;
  originalMatch: string;
}

export interface FileReferenceMap {
  [filePath: string]: {
    outboundReferences: DocumentReference[];
    inboundReferences: DocumentReference[];
    lastModified: Date;
    contentHash: string;
  };
}

export interface LinkValidationResult {
  totalLinks: number;
  validLinks: number;
  brokenLinks: BrokenLink[];
  externalLinks: ExternalLinkStatus[];
  checkTimestamp: Date;
  validationDuration: number;
}

export interface BrokenLink {
  sourceFile: string;
  linkText: string;
  targetPath: string;
  lineNumber: number;
  errorType: 'file_not_found' | 'anchor_not_found' | 'access_denied' | 'invalid_path';
  errorMessage: string;
}

export interface ExternalLinkStatus {
  url: string;
  status: 'valid' | 'invalid' | 'timeout' | 'unknown';
  statusCode?: number;
  responseTime?: number;
  lastChecked: Date;
}

export interface ReferenceUpdateResult {
  updatedFiles: string[];
  totalUpdates: number;
  failedUpdates: Array<{
    file: string;
    error: string;
  }>;
  backupCreated: boolean;
}

export interface LinkRepairSuggestion {
  brokenLink: BrokenLink;
  suggestedTarget: string;
  confidence: number;
  repairType: 'file_rename' | 'path_correction' | 'anchor_fix' | 'file_move';
  reasoning: string;
}

export interface DependencyMap {
  [filePath: string]: {
    dependencies: string[];
    dependents: string[];
    depth: number;
    criticalPath: boolean;
  };
}

export interface CircularDependency {
  cycle: string[];
  severity: 'warning' | 'error';
  description: string;
}

export interface ReferenceTrackingConfig {
  baseDirectory: string;
  fileExtensions: string[];
  excludePatterns: string[];
  linkPatterns: {
    markdown: RegExp;
    relative: RegExp;
    external: RegExp;
  };
  validation?: {
    checkExternalLinks?: boolean;
    externalLinkTimeout?: number;
    cacheExternalResults?: boolean;
    cacheDuration?: number;
  };
  backup?: {
    enabled: boolean;
    directory: string;
    maxBackups: number;
  };
}

export interface LinkTrackingMetrics {
  totalFiles: number;
  totalLinks: number;
  averageLinksPerFile: number;
  mostReferencedFiles: Array<{
    file: string;
    referenceCount: number;
  }>;
  orphanedFiles: string[];
  lastScanDuration: number;
  lastScanTimestamp: Date;
}