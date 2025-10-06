import { 
  ChecklistStep, 
  StepStatus, 
  StepValidationResult, 
  DeveloperRole, 
  ProgressUpdate,
  Result,
  SuccessResult,
  ErrorResult
} from '../types';
import { OnboardingError } from '../errors';
import { StepGenerator } from './step-generators';
import { PlatformInstructions } from './platform-instructions';
import { ContextualHelp } from './contextual-help';
import * as os from 'os';

/**
 * ProgressiveChecklist manages step-by-step onboarding workflows with validation,
 * progress tracking, and contextual help for both human developers and AI agents.
 * 
 * Key features:
 * - Platform-specific installation instructions
 * - Role-based guidance customization
 * - Step dependency management and validation
 * - Progress tracking with completion percentages
 * - Contextual help and troubleshooting resources
 */
export class ProgressiveChecklist {
  private sessionSteps: Map<string, ChecklistStep[]> = new Map();
  private sessionProgress: Map<string, { [stepId: string]: StepStatus }> = new Map();

  /**
   * Generate role-specific checklist with platform-specific instructions
   */
  generateChecklistForRole(role: DeveloperRole, platform: string = os.platform(), sessionId?: string): ChecklistStep[] {
    const baseSteps = StepGenerator.getRoleSpecificSteps(role);
    
    const steps = baseSteps.map(step => ({
      ...step,
      platformSpecific: PlatformInstructions.getInstructions(step.id, platform),
      contextualHelp: ContextualHelp.getHelp(step.id, role),
      sessionId
    }));

    // Store steps for session if sessionId provided
    if (sessionId) {
      this.sessionSteps.set(sessionId, steps);
    }

    return steps;
  }

  /**
   * Validate completion of a specific step
   */
  async validateStepCompletion(stepId: string, validationData: any): Promise<StepValidationResult> {
    const validators = this.getStepValidators();
    const validator = validators[stepId];
    
    if (!validator) {
      return {
        isValid: false,
        errors: [`No validator found for step: ${stepId}`],
        warnings: [],
        validationDetails: {},
        timestamp: new Date()
      };
    }

    return validator(validationData);
  }

  /**
   * Update progress for a session and step
   */
  updateProgress(sessionId: string, stepId: string, status: StepStatus): Result<ProgressUpdate, OnboardingError> {
    try {
      const steps = this.sessionSteps.get(sessionId) || [];
      const progress = this.sessionProgress.get(sessionId) || {};
      
      // Check if step is locked (prerequisites not met)
      const step = steps.find(s => s.id === stepId);
      if (!step) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Step ${stepId} not found`, 'STEP_NOT_FOUND')
        } as ErrorResult<OnboardingError>;
      }

      if (this.isStepLocked(stepId, progress, steps)) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Step ${stepId} is locked`, 'STEP_LOCKED')
        } as ErrorResult<OnboardingError>;
      }

      // Update progress
      progress[stepId] = status;
      this.sessionProgress.set(sessionId, progress);

      // Calculate completion percentage
      const completedSteps = Object.values(progress).filter(s => s === StepStatus.COMPLETED).length;
      const percentComplete = Math.round((completedSteps / steps.length) * 100);

      // Find next step
      const currentIndex = steps.findIndex(s => s.id === stepId);
      const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1].id : undefined;

      // Unlock next steps
      const unlockedSteps = this.getUnlockedSteps(progress, steps);

      const update: ProgressUpdate = {
        sessionId,
        currentStep: stepId,
        nextStep,
        percentComplete,
        unlockedSteps,
        timestamp: new Date()
      };

      return {
        isSuccess: true,
        value: update
      } as SuccessResult<ProgressUpdate>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to update progress', 'PROGRESS_UPDATE_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Get current progress for a session
   */
  getProgress(sessionId: string): Result<ProgressUpdate, OnboardingError> {
    const progress = this.sessionProgress.get(sessionId);
    const steps = this.sessionSteps.get(sessionId);
    
    if (!progress || !steps) {
      return {
        isSuccess: false,
        error: new OnboardingError(`No progress found for session ${sessionId}`, 'SESSION_NOT_FOUND')
      } as ErrorResult<OnboardingError>;
    }

    const completedSteps = Object.values(progress).filter(s => s === StepStatus.COMPLETED).length;
    const percentComplete = Math.round((completedSteps / steps.length) * 100);

    return {
      isSuccess: true,
      value: {
        sessionId,
        currentStep: Object.keys(progress)[Object.keys(progress).length - 1],
        percentComplete,
        unlockedSteps: this.getUnlockedSteps(progress, steps),
        timestamp: new Date()
      }
    } as SuccessResult<ProgressUpdate>;
  }

  /**
   * Provide contextual help for a specific step and role
   */
  provideContextualHelp(stepId: string, role: DeveloperRole): string[] {
    return ContextualHelp.getHelp(stepId, role);
  }

  /**
   * Get troubleshooting tips for common issues with a step
   */
  getTroubleshootingTips(stepId: string): string[] {
    return ContextualHelp.getTroubleshootingTips(stepId);
  }


  private getStepValidators(): { [stepId: string]: (data: any) => Promise<StepValidationResult> } {
    return {
      'environment-setup': async (data: any): Promise<StepValidationResult> => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const validationDetails: any = {};

        // Validate Node.js version
        if (data.nodeVersion) {
          validationDetails.nodeVersion = data.nodeVersion;
          const major = parseInt(data.nodeVersion.split('.')[0]);
          if (major < 20) {
            errors.push('Node.js version must be 20 or higher');
          }
        } else {
          errors.push('Node.js version not provided');
        }

        // Validate npm version
        if (data.npmVersion) {
          validationDetails.npmVersion = data.npmVersion;
          const major = parseInt(data.npmVersion.split('.')[0]);
          if (major < 10) {
            warnings.push('npm version should be 10 or higher for best compatibility');
          }
        }

        return {
          isValid: errors.length === 0,
          errors,
          warnings,
          validationDetails,
          timestamp: new Date()
        };
      },

      'dependencies-install': async (data: any): Promise<StepValidationResult> => {
        const errors: string[] = [];
        const validationDetails: any = {};

        if (!data.nodeModulesExists) {
          errors.push('node_modules directory not found');
        } else {
          validationDetails.nodeModulesExists = true;
        }

        if (!data.packageLockExists) {
          errors.push('package-lock.json not found');
        } else {
          validationDetails.packageLockExists = true;
        }

        return {
          isValid: errors.length === 0,
          errors,
          warnings: [],
          validationDetails,
          timestamp: new Date()
        };
      }
    };
  }

  private isStepLocked(stepId: string, progress: { [stepId: string]: StepStatus }, steps: ChecklistStep[]): boolean {
    const step = steps.find(s => s.id === stepId);
    if (!step) return true;

    // Check if all dependencies are completed
    return step.dependencies.some(depId => progress[depId] !== StepStatus.COMPLETED);
  }

  private getUnlockedSteps(progress: { [stepId: string]: StepStatus }, steps: ChecklistStep[]): string[] {
    return steps
      .filter(step => !this.isStepLocked(step.id, progress, steps))
      .map(step => step.id);
  }
}