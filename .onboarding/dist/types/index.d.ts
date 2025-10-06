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
//# sourceMappingURL=index.d.ts.map