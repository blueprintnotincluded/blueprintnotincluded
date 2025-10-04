/**
 * Enhanced progress tracking and error recovery for asset processing
 * Provides granular progress reporting and automatic retry capabilities
 */
export interface ProcessingStep {
  name: string;
  description: string;
  execute: () => Promise<boolean>;
  retryable: boolean;
  maxRetries: number;
  dependencies?: string[];
}

export interface ProcessingState {
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  progress?: number;
  total?: number;
  errorMessage?: string;
  retryCount: number;
  startTime?: number;
  endTime?: number;
}

export class ProgressTracker {
  private steps: Map<string, ProcessingStep> = new Map();
  private state: Map<string, ProcessingState> = new Map();
  private completedSteps: Set<string> = new Set();
  private failedSteps: Set<string> = new Set();

  /**
   * Register a processing step
   */
  registerStep(step: ProcessingStep): void {
    this.steps.set(step.name, step);
    this.state.set(step.name, {
      stepName: step.name,
      status: 'pending',
      retryCount: 0
    });
  }

  /**
   * Execute all registered steps in dependency order
   */
  async executeAll(): Promise<boolean> {
    const executionOrder = this.calculateExecutionOrder();
    
    for (const stepName of executionOrder) {
      const success = await this.executeStep(stepName);
      if (!success) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute a specific step with retry logic
   */
  async executeStep(stepName: string): Promise<boolean> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Unknown step: ${stepName}`);
    }

    const state = this.state.get(stepName)!;
    
    // Check dependencies
    if (!this.checkDependencies(step)) {
      state.status = 'failed';
      state.errorMessage = 'Dependencies not satisfied';
      return false;
    }

    let attempts = 0;
    const maxAttempts = step.retryable ? step.maxRetries + 1 : 1;

    while (attempts < maxAttempts) {
      attempts++;
      state.retryCount = attempts - 1;
      state.status = attempts > 1 ? 'retrying' : 'running';
      state.startTime = Date.now();
      state.errorMessage = undefined;

      try {
        console.log(`[ProgressTracker] ${attempts > 1 ? 'Retrying' : 'Starting'} step: ${step.name} (${step.description})`);
        
        const success = await step.execute();
        
        if (success) {
          state.status = 'completed';
          state.endTime = Date.now();
          this.completedSteps.add(stepName);
          
          const duration = state.endTime - state.startTime!;
          console.log(`[ProgressTracker] ✓ Completed step: ${step.name} in ${duration}ms`);
          return true;
        }
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[ProgressTracker] ✗ Step failed: ${step.name}`, state.errorMessage);
      }

      // If retryable and have more attempts
      if (step.retryable && attempts < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000); // Exponential backoff, max 10s
        console.log(`[ProgressTracker] Retrying step "${step.name}" in ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`);
        await this.sleep(delay);
      }
    }

    // All attempts failed
    state.status = 'failed';
    state.endTime = Date.now();
    this.failedSteps.add(stepName);
    console.error(`[ProgressTracker] ✗ Step permanently failed: ${step.name} after ${attempts} attempts`);
    return false;
  }

  /**
   * Update progress for a currently running step
   */
  updateProgress(stepName: string, current: number, total: number): void {
    const state = this.state.get(stepName);
    if (state) {
      state.progress = current;
      state.total = total;
      
      const percentage = ((current / total) * 100).toFixed(1);
      console.log(`[ProgressTracker] Progress [${stepName}]: ${current}/${total} (${percentage}%)`);
    }
  }

  /**
   * Get current state of all steps
   */
  getState(): Record<string, ProcessingState> {
    const result: Record<string, ProcessingState> = {};
    for (const [name, state] of this.state) {
      result[name] = { ...state };
    }
    return result;
  }

  /**
   * Get summary of processing
   */
  getSummary(): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
  } {
    let completed = 0, failed = 0, pending = 0, running = 0;
    
    for (const state of this.state.values()) {
      switch (state.status) {
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'pending': pending++; break;
        case 'running':
        case 'retrying': running++; break;
      }
    }

    return {
      total: this.steps.size,
      completed,
      failed,
      pending,
      running
    };
  }

  /**
   * Check if step dependencies are satisfied
   */
  private checkDependencies(step: ProcessingStep): boolean {
    if (!step.dependencies) return true;
    
    return step.dependencies.every(dep => this.completedSteps.has(dep));
  }

  /**
   * Calculate execution order based on dependencies
   */
  private calculateExecutionOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (stepName: string): void => {
      if (visited.has(stepName)) return;
      if (visiting.has(stepName)) {
        throw new Error(`Circular dependency detected involving step: ${stepName}`);
      }

      visiting.add(stepName);
      
      const step = this.steps.get(stepName);
      if (step?.dependencies) {
        for (const dep of step.dependencies) {
          if (!this.steps.has(dep)) {
            throw new Error(`Step "${stepName}" depends on unknown step "${dep}"`);
          }
          visit(dep);
        }
      }

      visiting.delete(stepName);
      visited.add(stepName);
      order.push(stepName);
    };

    for (const stepName of this.steps.keys()) {
      visit(stepName);
    }

    return order;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset tracker for new processing run
   */
  reset(): void {
    this.completedSteps.clear();
    this.failedSteps.clear();
    
    for (const [stepName, state] of this.state) {
      state.status = 'pending';
      state.progress = undefined;
      state.total = undefined;
      state.errorMessage = undefined;
      state.retryCount = 0;
      state.startTime = undefined;
      state.endTime = undefined;
    }
  }

  /**
   * Cancel all processing
   */
  cancel(): void {
    for (const [stepName, state] of this.state) {
      if (state.status === 'running' || state.status === 'retrying') {
        state.status = 'failed';
        state.errorMessage = 'Cancelled by user';
        state.endTime = Date.now();
        this.state.set(stepName, state);
      }
    }
  }
}