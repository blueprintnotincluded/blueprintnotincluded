"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(level = LogLevel.INFO, correlationId) {
        this.level = level;
        this.correlationId = correlationId;
    }
    setCorrelationId(correlationId) {
        this.correlationId = correlationId;
    }
    error(message, context) {
        this.log(LogLevel.ERROR, message, context);
    }
    warn(message, context) {
        this.log(LogLevel.WARN, message, context);
    }
    info(message, context) {
        this.log(LogLevel.INFO, message, context);
    }
    debug(message, context) {
        this.log(LogLevel.DEBUG, message, context);
    }
    log(level, message, context) {
        if (level <= this.level) {
            const entry = {
                timestamp: new Date(),
                level,
                message,
                context,
                correlationId: this.correlationId
            };
            this.output(entry);
        }
    }
    output(entry) {
        const timestamp = entry.timestamp.toISOString();
        const levelName = LogLevel[entry.level];
        const correlationPart = entry.correlationId ? ` [${entry.correlationId}]` : '';
        const contextPart = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
        const logMessage = `${timestamp} ${levelName}${correlationPart}: ${entry.message}${contextPart}`;
        // Output to appropriate stream based on level
        if (entry.level === LogLevel.ERROR) {
            console.error(logMessage);
        }
        else {
            console.log(logMessage);
        }
    }
    createChildLogger(correlationId) {
        return new Logger(this.level, correlationId);
    }
}
exports.Logger = Logger;
// Default logger instance
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map