export interface OnboardingMetrics {
  totalOnboardings: number;
  averageCompletionTime: number;
  successRate: number;
  commonBlockingPoints: string[];
  roleBreakdown: Map<DeveloperRole, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
  generatedAt: Date;
}

export interface SyncStatus {
  success: boolean;
  lastSync: Date;
  itemsSynced: number;
  errors: string[];
  nextSync?: Date;
}

export interface WebhookEvent {
  type: 'push' | 'pull_request' | 'issue' | 'release';
  repository: string;
  data: any;
  timestamp: Date;
}

export interface WebhookRegistration {
  success: boolean;
  webhookIds: string[];
  endpoints: string[];
  events: string[];
  expiresAt?: Date;
}

export interface ProjectManagementConfig {
  platform: 'github' | 'jira' | 'linear' | 'asana' | 'trello';
  repositoryUrl?: string;
  projectKey?: string;
  apiToken: string;
  workspace?: string;
}

export interface TeamNotificationConfig {
  platform: 'slack' | 'discord' | 'teams' | 'email';
  webhookUrl?: string;
  channel?: string;
  recipients?: string[];
}

export interface ProgressReportResult {
  success: boolean;
  messagesSent: number;
  recipients: string[];
  timestamp: Date;
}

export interface IssueCreationConfig {
  platform: 'github' | 'jira' | 'linear';
  projectKey?: string;
  issueType: string;
  title: string;
  description: string;
  assignee?: string;
  labels?: string[];
  priority?: string;
}

export interface IssueCreationResult {
  success: boolean;
  issueId: string;
  issueUrl: string;
  platform: string;
}

export interface Plugin {
  name: string;
  version: string;
  type: 'integration' | 'notification' | 'validation' | 'reporting';
  entryPoint: string;
  config?: Record<string, any>;
  permissions?: string[];
  dependencies?: string[];
  author?: string;
  description?: string;
}

export interface PluginRegistrationResult {
  success: boolean;
  pluginId: string;
  status: 'active' | 'inactive' | 'error';
  warnings?: string[];
}

export interface PluginValidationResult {
  isValid: boolean;
  securityChecks: SecurityCheck[];
  compatibilityChecks: CompatibilityCheck[];
  warnings: string[];
  errors: string[];
}

export interface SecurityCheck {
  name: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface CompatibilityCheck {
  name: string;
  passed: boolean;
  requirement: string;
  actual: string;
  message: string;
}

export interface CustomIntegrationConfig {
  name: string;
  endpoints: string[];
  hooks: string[];
  permissions: string[];
  version?: string;
}

export interface ExtensionAPIResult {
  success: boolean;
  apiKey: string;
  endpoints: string[];
  documentation?: string;
  rateLimit?: {
    requests: number;
    period: string;
  };
}

export interface PluginError {
  type: 'runtime-error' | 'validation-error' | 'permission-error' | 'dependency-error';
  message: string;
  stack?: string;
  timestamp: Date;
  pluginId: string;
}

export interface PluginErrorResult {
  handled: boolean;
  action: 'retry' | 'disable' | 'remove' | 'ignore';
  recoveryAttempted: boolean;
  nextRetry?: Date;
}

export interface WebhookPayload {
  event: string;
  repository: {
    name: string;
    url: string;
  };
  commits?: Array<{
    id: string;
    message: string;
    modified: string[];
  }>;
  pullRequest?: {
    id: number;
    title: string;
    state: string;
  };
  issue?: {
    id: number;
    title: string;
    state: string;
  };
}

export interface WebhookEventResult {
  processed: boolean;
  actions: string[];
  errors?: string[];
  duration: number;
}

export interface BuildInformation {
  buildId: string;
  branch: string;
  commit: string;
  status: 'success' | 'failure' | 'pending';
  artifacts?: string[];
  timestamp: Date;
  duration?: number;
}

export interface UpdateStatus {
  success: boolean;
  documentsUpdated: number;
  validationTriggered: boolean;
  errors?: string[];
}

export interface DocumentationValidationConfig {
  branch: string;
  files: string[];
  strictMode: boolean;
  skipCache?: boolean;
}

export interface DocumentationValidationResult {
  success: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  duration: number;
  filesChecked: number;
}

export interface ValidationError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
  rule?: string;
}

export interface ValidationWarning {
  file: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface SyncWithProjectManagementResult {
  success: boolean;
  tasksCreated: number;
  tasksUpdated: number;
  errors?: string[];
}

export interface PluginLifecycleResult {
  success: boolean;
  status: 'active' | 'inactive' | 'error';
  message?: string;
}

export enum DeveloperRole {
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  DEVOPS = 'devops',
  FULLSTACK = 'fullstack',
  QA = 'qa',
  DESIGNER = 'designer'
}