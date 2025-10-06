export interface OnboardingSession {
    sessionId: string;
    userId: string;
    userType: UserType;
    developerRole?: DeveloperRole;
    startTime: Date;
    lastActivity: Date;
    currentStep: string;
    completedSteps: string[];
    isComplete: boolean;
    customizations?: {
        preferredLanguage?: string;
        experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
        focusAreas?: string[];
    };
    progress?: {
        totalSteps: number;
        completedCount: number;
        estimatedTimeRemaining: number;
    };
}
export interface ProjectMetadata {
    name: string;
    description: string;
    version: string;
    technologies: TechnologyStack;
    architecture: ArchitecturePattern;
    conventions: CodingStandards;
    lastUpdated: string;
}
export interface TechnologyStack {
    runtime: string;
    language: string;
    framework: string;
    database?: string;
    dependencies: string[];
}
export interface ArchitecturePattern {
    pattern: string;
    description: string;
    components: string[];
}
export interface CodingStandards {
    styleGuide: string;
    linting: string[];
    formatting: string;
    testing: string;
}
export declare enum UserType {
    HUMAN_DEVELOPER = "human",
    AI_AGENT = "agent"
}
export declare enum DeveloperRole {
    FRONTEND = "frontend",
    BACKEND = "backend",
    DEVOPS = "devops",
    FULLSTACK = "fullstack"
}
export interface DocumentMetadata {
    title: string;
    description: string;
    tags: string[];
    targetRoles: DeveloperRole[];
    estimatedReadTime: number;
    prerequisites: string[];
}
export interface ProgressState {
    sessionId: string;
    currentStep: string;
    completedSteps: string[];
    totalSteps: number;
    percentComplete: number;
    estimatedTimeRemaining: number;
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    timestamp: Date;
}
export interface Result<T, E> {
    isSuccess: boolean;
    value?: T;
    error?: E;
}
export interface SuccessResult<T> extends Result<T, never> {
    isSuccess: true;
    value: T;
}
export interface ErrorResult<E> extends Result<never, E> {
    isSuccess: false;
    error: E;
}
export interface UserDetectionInput {
    role?: string;
    hasExperience?: boolean;
    requestType?: string;
    capabilities?: string[];
}
export interface UserDetectionResult {
    userType: UserType;
    recommendedRole?: DeveloperRole;
    confidence: number;
}
export interface ChecklistStep {
    id: string;
    title: string;
    description: string;
    isRequired: boolean;
    estimatedTime: number;
    dependencies: string[];
    status: StepStatus;
    platformSpecific?: {
        [platform: string]: string;
    };
    contextualHelp: string[];
    validationCriteria?: {
        [key: string]: any;
    };
    sessionId?: string;
}
export declare enum StepStatus {
    LOCKED = "locked",
    AVAILABLE = "available",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    SKIPPED = "skipped",
    FAILED = "failed"
}
export interface StepValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    validationDetails: {
        [key: string]: any;
    };
    timestamp: Date;
}
export interface ProgressUpdate {
    sessionId: string;
    currentStep: string;
    previousStep?: string;
    nextStep?: string;
    percentComplete: number;
    unlockedSteps: string[];
    timestamp: Date;
}
export interface GitChangeEvent {
    hasChanges: boolean;
    changedFiles: string[];
    timestamp: Date;
    commitHash?: string;
    branch?: string;
}
export interface ChangeRelevanceAnalysis {
    requiresDocumentationUpdate: boolean;
    affectedDocuments: string[];
    changeCategory: 'documentation' | 'code' | 'config' | 'mixed';
    priority: 'high' | 'medium' | 'low';
}
export interface DocumentationUpdateTrigger {
    triggered: boolean;
    updateType: string;
    affectedFiles: string[];
    reason?: string;
}
export interface DocumentationTask {
    id: string;
    type: 'api-schema-update' | 'architecture-documentation' | 'example-update' | 'migration-guide';
    description: string;
    files: string[];
    priority: 'high' | 'medium' | 'low';
    estimatedTime: number;
}
export type WebhookEvent = 'push' | 'pull_request' | 'release' | 'issues';
export interface WebhookRegistration {
    webhookId: string;
    events: WebhookEvent[];
    endpointUrl: string;
    secret?: string;
}
export interface GitMonitoringResult {
    isGitRepository: boolean;
    repositoryPath: string;
    currentBranch?: string;
    lastCommit?: string;
}
export interface WebhookEventData {
    type: WebhookEvent;
    repository?: string;
    branch?: string;
    commits?: Array<{
        id: string;
        message: string;
        modified: string[];
        added: string[];
        removed: string[];
    }>;
    action?: string;
    pullRequest?: {
        number: number;
        title: string;
        changedFiles: string[];
    };
    timestamp: Date;
}
export interface WebhookHandleResult {
    processed: boolean;
    actionsTaken: string[];
    documentationUpdatesTriggered: boolean;
    prAnalysis?: {
        requiresDocumentationReview: boolean;
        suggestedReviewers: string[];
        affectedSections: string[];
    };
}
export interface DocumentationSyncResult {
    documentationPath: string;
    syncStatus: 'success' | 'partial' | 'failed';
    updatedSections: string[];
    errorMessage?: string;
    fallbackAction?: 'manual_update' | 'skip' | 'retry';
}
export interface DocumentationFreshnessCheck {
    isUpToDate: boolean;
    staleDocuments: Array<{
        path: string;
        lastUpdated: Date;
        staleness: number;
    }>;
    lastSyncTimestamp: Date;
}
export interface DocumentationRecommendation {
    priority: 'high' | 'medium' | 'low';
    section: string;
    suggestedChanges: string;
    reason: string;
    affectedFiles: string[];
}
export interface DocumentationChangeHistory {
    changes: Array<{
        timestamp: Date;
        type: 'code' | 'documentation' | 'sync';
        files: string[];
        description: string;
        author?: string;
    }>;
    totalChanges: number;
    lastChange?: Date;
}
export * from './content-validation';
export * from './link-tracking';
export * from './executable-examples';
//# sourceMappingURL=index.d.ts.map