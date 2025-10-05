"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationError = exports.NotFoundError = exports.SchemaError = exports.FileSystemError = exports.ValidationError = exports.OnboardingError = void 0;
exports.createErrorContext = createErrorContext;
class OnboardingError extends Error {
    constructor(message, code, context) {
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
exports.OnboardingError = OnboardingError;
class ValidationError extends OnboardingError {
    constructor(message, context) {
        super(message, 'VALIDATION_ERROR', context);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class FileSystemError extends OnboardingError {
    constructor(message, context) {
        super(message, 'FILESYSTEM_ERROR', context);
        this.name = 'FileSystemError';
    }
}
exports.FileSystemError = FileSystemError;
class SchemaError extends OnboardingError {
    constructor(message, context) {
        super(message, 'SCHEMA_ERROR', context);
        this.name = 'SchemaError';
    }
}
exports.SchemaError = SchemaError;
class NotFoundError extends OnboardingError {
    constructor(message, context) {
        super(message, 'NOT_FOUND_ERROR', context);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class ConfigurationError extends OnboardingError {
    constructor(message, context) {
        super(message, 'CONFIGURATION_ERROR', context);
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
function createErrorContext(operation, userId, sessionId, metadata) {
    return {
        timestamp: new Date(),
        operation,
        userId,
        sessionId,
        metadata
    };
}
//# sourceMappingURL=index.js.map