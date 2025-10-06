import { 
  OnboardingSession, 
  UserType, 
  DeveloperRole, 
  Result, 
  SuccessResult, 
  ErrorResult, 
  UserDetectionInput,
  UserDetectionResult
} from '../types';
import { OnboardingError } from '../errors';
import { randomUUID } from 'crypto';

export class OnboardingOrchestrator {
  private sessions: Map<string, OnboardingSession> = new Map();

  /**
   * Start a new onboarding session for a user
   */
  startOnboarding(
    userType: UserType, 
    role?: DeveloperRole
  ): Result<OnboardingSession, OnboardingError> {
    try {
      const sessionId = randomUUID();
      const now = new Date();
      
      const session: OnboardingSession = {
        sessionId,
        userId: sessionId, // For now, use sessionId as userId
        userType,
        developerRole: role,
        startTime: now,
        lastActivity: now,
        currentStep: this.determineInitialStep(userType, role),
        completedSteps: [],
        isComplete: false,
        customizations: {},
        progress: {
          totalSteps: this.calculateTotalSteps(userType, role),
          completedCount: 0,
          estimatedTimeRemaining: this.estimateInitialTime(userType, role)
        }
      };

      this.sessions.set(sessionId, session);

      return {
        isSuccess: true,
        value: session
      } as SuccessResult<OnboardingSession>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to create onboarding session', 'SESSION_CREATION_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Detect user type based on input characteristics
   */
  detectUserType(input: UserDetectionInput): Result<UserDetectionResult, OnboardingError> {
    try {
      // AI Agent detection patterns
      if (input.requestType === 'context' || input.capabilities) {
        return {
          isSuccess: true,
          value: {
            userType: UserType.AI_AGENT,
            confidence: 0.9
          }
        } as SuccessResult<UserDetectionResult>;
      }

      // Human developer detection patterns
      if (input.role || input.hasExperience !== undefined) {
        const recommendedRole = this.mapRoleString(input.role);
        return {
          isSuccess: true,
          value: {
            userType: UserType.HUMAN_DEVELOPER,
            recommendedRole,
            confidence: 0.85
          }
        } as SuccessResult<UserDetectionResult>;
      }

      // Default to human if unclear
      return {
        isSuccess: true,
        value: {
          userType: UserType.HUMAN_DEVELOPER,
          confidence: 0.5
        }
      } as SuccessResult<UserDetectionResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to detect user type', 'USER_DETECTION_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  private determineInitialStep(userType: UserType, role?: DeveloperRole): string {
    if (userType === UserType.AI_AGENT) {
      return 'context-loading';
    }

    // Human developer steps based on role
    switch (role) {
      case DeveloperRole.FRONTEND:
        return 'environment-setup';
      case DeveloperRole.BACKEND:
        return 'environment-setup';
      case DeveloperRole.DEVOPS:
        return 'infrastructure-setup';
      case DeveloperRole.FULLSTACK:
        return 'environment-setup';
      default:
        return 'role-selection';
    }
  }

  private calculateTotalSteps(userType: UserType, role?: DeveloperRole): number {
    if (userType === UserType.AI_AGENT) {
      return 3; // context-loading, schema-validation, integration-test
    }

    // Human developer steps vary by role
    switch (role) {
      case DeveloperRole.FRONTEND:
        return 8; // setup, deps, build, test, lint, dev-server, first-change, docs
      case DeveloperRole.BACKEND:
        return 10; // setup, deps, db, test, api-test, build, lint, env, first-change, docs
      case DeveloperRole.DEVOPS:
        return 12; // infra, docker, k8s, ci/cd, monitoring, security, deployment, etc.
      case DeveloperRole.FULLSTACK:
        return 15; // combination of frontend + backend
      default:
        return 5; // basic onboarding steps
    }
  }

  private estimateInitialTime(userType: UserType, role?: DeveloperRole): number {
    if (userType === UserType.AI_AGENT) {
      return 2; // minutes
    }

    // Human developer estimates in minutes
    switch (role) {
      case DeveloperRole.FRONTEND:
        return 45;
      case DeveloperRole.BACKEND:
        return 60;
      case DeveloperRole.DEVOPS:
        return 90;
      case DeveloperRole.FULLSTACK:
        return 120;
      default:
        return 30;
    }
  }

  private mapRoleString(roleStr?: string): DeveloperRole | undefined {
    if (!roleStr) return undefined;
    
    const role = roleStr.toLowerCase();
    switch (role) {
      case 'frontend':
      case 'front-end':
      case 'fe':
        return DeveloperRole.FRONTEND;
      case 'backend':
      case 'back-end':
      case 'be':
        return DeveloperRole.BACKEND;
      case 'devops':
      case 'ops':
      case 'sre':
        return DeveloperRole.DEVOPS;
      case 'fullstack':
      case 'full-stack':
      case 'fs':
        return DeveloperRole.FULLSTACK;
      default:
        return undefined;
    }
  }
}