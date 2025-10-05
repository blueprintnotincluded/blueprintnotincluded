export enum LogLevel {
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

export class Logger {
  private level: LogLevel;
  private correlationId?: string;

  constructor(level: LogLevel = LogLevel.INFO, correlationId?: string) {
    this.level = level;
    this.correlationId = correlationId;
  }

  public setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  public error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level <= this.level) {
      const entry: LogEntry = {
        timestamp: new Date(),
        level,
        message,
        context,
        correlationId: this.correlationId
      };

      this.output(entry);
    }
  }

  private output(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    const correlationPart = entry.correlationId ? ` [${entry.correlationId}]` : '';
    const contextPart = entry.context ? ` ${JSON.stringify(entry.context)}` : '';

    const logMessage = `${timestamp} ${levelName}${correlationPart}: ${entry.message}${contextPart}`;

    // Output to appropriate stream based on level
    if (entry.level === LogLevel.ERROR) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  public createChildLogger(correlationId: string): Logger {
    return new Logger(this.level, correlationId);
  }
}

// Default logger instance
export const logger = new Logger();