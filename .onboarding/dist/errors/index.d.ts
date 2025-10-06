export declare class OnboardingError extends Error {
    readonly code: string;
    readonly context?: Record<string, any>;
    constructor(message: string, code: string, context?: Record<string, any>);
}
export declare class ValidationError extends OnboardingError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class FileSystemError extends OnboardingError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class SchemaError extends OnboardingError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class NotFoundError extends OnboardingError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class ConfigurationError extends OnboardingError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class GitError extends OnboardingError {
    constructor(message: string, context?: Record<string, any>);
}
export interface ErrorContext {
    timestamp: Date;
    operation: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
}
export declare function createErrorContext(operation: string, userId?: string, sessionId?: string, metadata?: Record<string, any>): ErrorContext;
//# sourceMappingURL=index.d.ts.map