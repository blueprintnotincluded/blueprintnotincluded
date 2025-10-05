export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    context?: Record<string, any>;
    correlationId?: string;
}
export declare class Logger {
    private level;
    private correlationId?;
    constructor(level?: LogLevel, correlationId?: string);
    setCorrelationId(correlationId: string): void;
    error(message: string, context?: Record<string, any>): void;
    warn(message: string, context?: Record<string, any>): void;
    info(message: string, context?: Record<string, any>): void;
    debug(message: string, context?: Record<string, any>): void;
    private log;
    private output;
    createChildLogger(correlationId: string): Logger;
}
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map