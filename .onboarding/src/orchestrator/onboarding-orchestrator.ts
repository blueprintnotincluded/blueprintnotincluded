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

export interface CompletionCertificate {
  sessionId: string;
  userType: UserType;
  developerRole?: DeveloperRole;
  completionDate: Date;
  achievements: string[];
  totalTime: number;
  certificateId: string;
}

export interface AnalyticsReport {
  totalSessions: number;
  completionRate: number;
  averageDuration: number;
  roleBreakdown: { [key: string]: number };
  commonIssues: string[];
  successMetrics: {
    totalCompleted: number;
    totalStarted: number;
    averageSteps: number;
  };
}

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

  /**
   * Generate completion certificate for a finished onboarding session
   */
  generateCertificate(sessionId: string): Result<CompletionCertificate, OnboardingError> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return {
          isSuccess: false,
          error: new OnboardingError('Session not found', 'SESSION_NOT_FOUND', { sessionId })
        } as ErrorResult<OnboardingError>;
      }

      if (!session.isComplete) {
        return {
          isSuccess: false,
          error: new OnboardingError('Session not completed', 'SESSION_INCOMPLETE', { sessionId })
        } as ErrorResult<OnboardingError>;
      }

      const certificate: CompletionCertificate = {
        sessionId: session.sessionId,
        userType: session.userType,
        developerRole: session.developerRole,
        completionDate: new Date(),
        achievements: this.calculateAchievements(session),
        totalTime: this.calculateTotalTime(session),
        certificateId: randomUUID()
      };

      return {
        isSuccess: true,
        value: certificate
      } as SuccessResult<CompletionCertificate>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to generate certificate', 'CERTIFICATE_GENERATION_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Generate analytics report for all onboarding sessions
   */
  generateAnalyticsReport(): Result<AnalyticsReport, OnboardingError> {
    try {
      const allSessions = Array.from(this.sessions.values());
      const completedSessions = allSessions.filter(s => s.isComplete);
      
      const roleBreakdown: { [key: string]: number } = {};
      let totalDuration = 0;

      for (const session of allSessions) {
        const role = session.developerRole || 'unknown';
        roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
        
        if (session.isComplete) {
          totalDuration += this.calculateTotalTime(session);
        }
      }

      const report: AnalyticsReport = {
        totalSessions: allSessions.length,
        completionRate: allSessions.length > 0 ? (completedSessions.length / allSessions.length) * 100 : 0,
        averageDuration: completedSessions.length > 0 ? totalDuration / completedSessions.length : 0,
        roleBreakdown,
        commonIssues: [], // TODO: Track issues during sessions
        successMetrics: {
          totalCompleted: completedSessions.length,
          totalStarted: allSessions.length,
          averageSteps: completedSessions.reduce((sum, s) => sum + s.completedSteps.length, 0) / Math.max(1, completedSessions.length)
        }
      };

      return {
        isSuccess: true,
        value: report
      } as SuccessResult<AnalyticsReport>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to generate analytics report', 'ANALYTICS_GENERATION_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Result<OnboardingSession, OnboardingError> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        isSuccess: false,
        error: new OnboardingError('Session not found', 'SESSION_NOT_FOUND', { sessionId })
      } as ErrorResult<OnboardingError>;
    }

    return {
      isSuccess: true,
      value: session
    } as SuccessResult<OnboardingSession>;
  }

  /**
   * Update session completion status
   */
  markSessionComplete(sessionId: string): Result<void, OnboardingError> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        isSuccess: false,
        error: new OnboardingError('Session not found', 'SESSION_NOT_FOUND', { sessionId })
      } as ErrorResult<OnboardingError>;
    }

    session.isComplete = true;
    session.lastActivity = new Date();
    session.completedAt = new Date();
    this.sessions.set(sessionId, session);

    return {
      isSuccess: true,
      value: undefined
    } as SuccessResult<void>;
  }

  private calculateAchievements(session: OnboardingSession): string[] {
    const achievements: string[] = [];
    
    if (session.completedSteps.length > 0) {
      achievements.push('First Steps Completed');
    }
    
    if (session.completedSteps.length >= 5) {
      achievements.push('Making Progress');
    }
    
    if (session.isComplete) {
      achievements.push('Onboarding Complete');
    }
    
    if (session.developerRole === DeveloperRole.FULLSTACK) {
      achievements.push('Full Stack Explorer');
    }
    
    return achievements;
  }

  private calculateTotalTime(session: OnboardingSession): number {
    // Calculate time from start to completion in minutes
    const now = new Date();
    const endTime = session.isComplete ? now : session.lastActivity;
    return Math.round((endTime.getTime() - session.startTime.getTime()) / (1000 * 60));
  }
}