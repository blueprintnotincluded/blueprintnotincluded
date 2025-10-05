export class OnboardingError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any>;

  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message);
    this.name = 'OnboardingError';
    this.code = code;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OnboardingError);
    }
  }
}

export class ValidationError extends OnboardingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class FileSystemError extends OnboardingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'FILESYSTEM_ERROR', context);
    this.name = 'FileSystemError';
  }
}

export class SchemaError extends OnboardingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SCHEMA_ERROR', context);
    this.name = 'SchemaError';
  }
}

export class NotFoundError extends OnboardingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'NOT_FOUND_ERROR', context);
    this.name = 'NotFoundError';
  }
}

export class ConfigurationError extends OnboardingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.name = 'ConfigurationError';
  }
}

export interface ErrorContext {
  timestamp: Date;
  operation: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export function createErrorContext(
  operation: string,
  userId?: string,
  sessionId?: string,
  metadata?: Record<string, any>
): ErrorContext {
  return {
    timestamp: new Date(),
    operation,
    userId,
    sessionId,
    metadata
  };
}