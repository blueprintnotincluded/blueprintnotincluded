/**
 * Structured logging system for asset processing scripts
 * Replaces scattered console.log calls with organized, contextual logging
 */
export class AssetLogger {
  private static context: string = 'AssetProcessing';
  private static startTime: number = Date.now();

  /**
   * Set context for current processing step
   */
  static setContext(context: string): void {
    this.context = context;
  }

  /**
   * Get elapsed time since process start
   */
  private static getElapsed(): string {
    const elapsed = Date.now() - this.startTime;
    const seconds = (elapsed / 1000).toFixed(1);
    return `${seconds}s`;
  }

  /**
   * Format log message with timestamp and context
   */
  private static format(level: string, message: string): string {
    const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
    const elapsed = this.getElapsed();
    return `[${timestamp}] [${elapsed}] [${this.context}] ${level}: ${message}`;
  }

  /**
   * Log informational messages
   */
  static info(message: string): void {
    console.log(this.format('INFO', message));
  }

  /**
   * Log warning messages
   */
  static warn(message: string): void {
    console.warn(this.format('WARN', message));
  }

  /**
   * Log error messages
   */
  static error(message: string, error?: Error): void {
    console.error(this.format('ERROR', message));
    if (error) {
      console.error(error.stack || error.message);
    }
  }

  /**
   * Log debug messages (only in development)
   */
  static debug(message: string): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.format('DEBUG', message));
    }
  }

  /**
   * Log process start
   */
  static startProcess(processName: string): void {
    this.startTime = Date.now();
    this.setContext(processName);
    this.info(`Starting ${processName}`);
  }

  /**
   * Log process completion
   */
  static completeProcess(processName: string): void {
    this.info(`Completed ${processName} in ${this.getElapsed()}`);
  }

  /**
   * Log file operations
   */
  static fileOperation(operation: string, path: string): void {
    this.info(`${operation}: ${path}`);
  }

  /**
   * Log progress with counts
   */
  static progress(current: number, total: number, operation: string): void {
    const percentage = ((current / total) * 100).toFixed(1);
    this.info(`Progress: ${current}/${total} (${percentage}%) - ${operation}`);
  }

  /**
   * Log memory usage (helpful for tracking memory leaks)
   */
  static memory(): void {
    if (process.env.NODE_ENV !== 'production') {
      const used = process.memoryUsage();
      const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
      this.debug(`Memory: RSS=${mb(used.rss)}MB, Heap=${mb(used.heapUsed)}/${mb(used.heapTotal)}MB`);
    }
  }

  /**
   * Log performance timing
   */
  static time(label: string): void {
    console.time(`[${this.context}] ${label}`);
  }

  static timeEnd(label: string): void {
    console.timeEnd(`[${this.context}] ${label}`);
  }

  /**
   * Reset start time for new process
   */
  static reset(): void {
    this.startTime = Date.now();
  }
}