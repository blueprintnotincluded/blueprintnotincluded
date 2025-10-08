import { 
  OnboardingSession, 
  UserType, 
  DeveloperRole, 
  StepStatus,
  Result, 
  SuccessResult, 
  ErrorResult 
} from '../types';
import { OnboardingError } from '../errors';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface SessionUpdateResult {
  sessionId: string;
  completedSteps: string[];
  progress: {
    totalSteps: number;
    completedCount: number;
    estimatedTimeRemaining: number;
  };
}

export interface SessionPersistResult {
  sessionId: string;
  filePath: string;
  timestamp: Date;
}

export interface SessionResumeResult extends OnboardingSession {
  resumedAt: Date;
  wasInterrupted: boolean;
}

export interface SessionState extends OnboardingSession {
  failureCount?: number;
  recoveryCount?: number;
  completedAt?: Date;
}

export interface SessionHistoryEntry {
  sessionId: string;
  userId: string;
  userType: UserType;
  developerRole?: DeveloperRole;
  startTime: Date;
  endTime?: Date;
  isComplete: boolean;
  completionPercentage: number;
}

/**
 * SessionManager handles the lifecycle of onboarding sessions including:
 * - Session creation and management
 * - Progress tracking with persistence
 * - Session resumption after interruption
 * - Progress estimation and time calculations
 */
export class SessionManager {
  private sessions: Map<string, OnboardingSession> = new Map();
  private sessionDataPath: string;

  constructor(sessionDataPath: string = '.onboarding/data/sessions') {
    this.sessionDataPath = sessionDataPath;
    this.ensureSessionDirectory();
  }

  /**
   * Create a new onboarding session
   */
  createSession(
    userId: string, 
    userType: UserType, 
    role?: DeveloperRole
  ): Result<OnboardingSession, OnboardingError> {
    try {
      const sessionId = randomUUID();
      const now = new Date();
      
      const session: OnboardingSession = {
        sessionId,
        userId,
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
        error: new OnboardingError('Failed to create session', 'SESSION_CREATION_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Retrieve an existing session
   */
  getSession(sessionId: string): Result<OnboardingSession, OnboardingError> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return {
        isSuccess: false,
        error: new OnboardingError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND')
      } as ErrorResult<OnboardingError>;
    }

    // Initialize failure tracking if not present
    if (session.failureCount === undefined) {
      session.failureCount = 0;
    }
    if (session.recoveryCount === undefined) {
      session.recoveryCount = 0;
    }

    return {
      isSuccess: true,
      value: session
    } as SuccessResult<OnboardingSession>;
  }

  /**
   * Update session progress and recalculate estimates
   */
  updateProgress(
    sessionId: string, 
    stepId: string, 
    status: StepStatus
  ): Result<SessionUpdateResult, OnboardingError> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND')
        } as ErrorResult<OnboardingError>;
      }

      // Update session data
      session.lastActivity = new Date();
      session.currentStep = stepId;

      if (status === StepStatus.COMPLETED && !session.completedSteps.includes(stepId)) {
        session.completedSteps.push(stepId);
        session.progress!.completedCount = session.completedSteps.length;
        
        // Recalculate estimated time remaining
        session.progress!.estimatedTimeRemaining = this.recalculateTimeEstimate(session);
      }

      // Check if onboarding is complete
      if (session.progress!.completedCount >= session.progress!.totalSteps) {
        session.isComplete = true;
        session.progress!.estimatedTimeRemaining = 0;
      }

      this.sessions.set(sessionId, session);

      return {
        isSuccess: true,
        value: {
          sessionId,
          completedSteps: session.completedSteps,
          progress: session.progress!
        }
      } as SuccessResult<SessionUpdateResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to update progress', 'PROGRESS_UPDATE_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Persist session data to filesystem
   */
  async persistSession(sessionId: string): Promise<Result<SessionPersistResult, OnboardingError>> {
    try {
      const session = this.sessions.get(sessionId);
      
      if (!session) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND')
        } as ErrorResult<OnboardingError>;
      }

      const filePath = path.join(this.sessionDataPath, `${sessionId}.json`);
      const sessionData = JSON.stringify(session, null, 2);
      
      await fs.promises.writeFile(filePath, sessionData, 'utf8');

      return {
        isSuccess: true,
        value: {
          sessionId,
          filePath,
          timestamp: new Date()
        }
      } as SuccessResult<SessionPersistResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to persist session', 'SESSION_PERSIST_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Resume a session from filesystem
   */
  async resumeSession(sessionId: string): Promise<Result<SessionResumeResult, OnboardingError>> {
    try {
      const filePath = path.join(this.sessionDataPath, `${sessionId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Session file not found: ${sessionId}`, 'SESSION_FILE_NOT_FOUND')
        } as ErrorResult<OnboardingError>;
      }

      const sessionData = await fs.promises.readFile(filePath, 'utf8');
      const session: OnboardingSession = JSON.parse(sessionData);
      
      // Convert date strings back to Date objects
      session.startTime = new Date(session.startTime);
      session.lastActivity = new Date(session.lastActivity);

      // Check if session was interrupted (last activity > 1 hour ago)
      const now = new Date();
      const wasInterrupted = (now.getTime() - session.lastActivity.getTime()) > (60 * 60 * 1000);

      // Update last activity
      session.lastActivity = now;

      this.sessions.set(sessionId, session);

      return {
        isSuccess: true,
        value: {
          ...session,
          resumedAt: now,
          wasInterrupted
        }
      } as SuccessResult<SessionResumeResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to resume session', 'SESSION_RESUME_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Get session history for a user
   */
  getSessionHistory(userId: string): Result<SessionHistoryEntry[], OnboardingError> {
    try {
      const userSessions = Array.from(this.sessions.values())
        .filter(session => session.userId === userId)
        .map(session => ({
          sessionId: session.sessionId,
          userId: session.userId,
          userType: session.userType,
          developerRole: session.developerRole,
          startTime: session.startTime,
          endTime: session.isComplete ? session.lastActivity : undefined,
          isComplete: session.isComplete,
          completionPercentage: Math.round((session.progress!.completedCount / session.progress!.totalSteps) * 100)
        }));

      return {
        isSuccess: true,
        value: userSessions
      } as SuccessResult<SessionHistoryEntry[]>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to get session history', 'SESSION_HISTORY_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Save session to filesystem (alias for persistSession)
   */
  saveSession(sessionId: string): Result<SessionPersistResult, OnboardingError> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND')
        } as ErrorResult<OnboardingError>;
      }

      const filePath = path.join(this.sessionDataPath, `${sessionId}.json`);
      const sessionData = JSON.stringify(session, null, 2);
      
      fs.writeFileSync(filePath, sessionData, 'utf8');

      return {
        isSuccess: true,
        value: {
          sessionId,
          filePath,
          timestamp: new Date()
        }
      } as SuccessResult<SessionPersistResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to save session', 'SESSION_SAVE_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Restore session from filesystem (alias for resumeSession)
   */
  restoreSession(sessionId: string): Result<OnboardingSession, OnboardingError> {
    try {
      const filePath = path.join(this.sessionDataPath, `${sessionId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return {
          isSuccess: false,
          error: new OnboardingError(`Session file not found: ${sessionId}`, 'SESSION_FILE_NOT_FOUND')
        } as ErrorResult<OnboardingError>;
      }

      const sessionData = fs.readFileSync(filePath, 'utf8');
      const session: OnboardingSession = JSON.parse(sessionData);
      
      // Convert date strings back to Date objects
      session.startTime = new Date(session.startTime);
      session.lastActivity = new Date(session.lastActivity);

      // Update last activity
      session.lastActivity = new Date();

      this.sessions.set(sessionId, session);

      return {
        isSuccess: true,
        value: session
      } as SuccessResult<OnboardingSession>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new OnboardingError('Failed to restore session', 'SESSION_RESTORE_FAILED', { details: error })
      } as ErrorResult<OnboardingError>;
    }
  }

  /**
   * Clear memory (for testing purposes)
   */
  clearMemory(): void {
    this.sessions.clear();
  }

  private ensureSessionDirectory(): void {
    if (!fs.existsSync(this.sessionDataPath)) {
      fs.mkdirSync(this.sessionDataPath, { recursive: true });
    }
  }

  private determineInitialStep(userType: UserType, role?: DeveloperRole): string {
    if (userType === UserType.AI_AGENT) {
      return 'context-loading';
    }

    switch (role) {
      case DeveloperRole.FRONTEND:
      case DeveloperRole.BACKEND:
      case DeveloperRole.FULLSTACK:
        return 'environment-setup';
      case DeveloperRole.DEVOPS:
        return 'infrastructure-setup';
      default:
        return 'role-selection';
    }
  }

  private calculateTotalSteps(userType: UserType, role?: DeveloperRole): number {
    if (userType === UserType.AI_AGENT) {
      return 3; // context-loading, schema-validation, integration-test
    }

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

  private recalculateTimeEstimate(session: OnboardingSession): number {
    const initialEstimate = this.estimateInitialTime(session.userType, session.developerRole);
    const totalSteps = session.progress!.totalSteps;
    const completedSteps = session.progress!.completedCount;
    const remainingSteps = totalSteps - completedSteps;
    
    // Calculate average time per step based on progress
    const timeElapsed = (new Date().getTime() - session.startTime.getTime()) / (1000 * 60); // minutes
    const avgTimePerStep = completedSteps > 0 ? timeElapsed / completedSteps : initialEstimate / totalSteps;
    
    // Apply efficiency factor (users typically get faster as they progress)
    const efficiencyFactor = Math.max(0.7, 1 - (completedSteps / totalSteps) * 0.3);
    
    return Math.round(remainingSteps * avgTimePerStep * efficiencyFactor);
  }

  async simulateLongRunningSession(sessionId: string, duration: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Mock implementation for testing
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to simulate long running session' };
    }
  }

  async cleanupSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Mock implementation for testing
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to cleanup session' };
    }
  }
}