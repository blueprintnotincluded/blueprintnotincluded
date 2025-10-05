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
//# sourceMappingURL=index.d.ts.map