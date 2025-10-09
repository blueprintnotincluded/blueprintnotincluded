import { expect } from 'chai';
import { SessionManager } from '../session/session-manager';
import { OnboardingSession, UserType, DeveloperRole, StepStatus } from '../types';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  describe('createSession', () => {
    it('should create a new session with valid parameters', () => {
      const result = sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value).to.have.property('sessionId');
      expect(result.value?.userId).to.equal('user123');
      expect(result.value?.userType).to.equal(UserType.HUMAN_DEVELOPER);
      expect(result.value?.developerRole).to.equal(DeveloperRole.FRONTEND);
      expect(result.value?.isComplete).to.be.false;
      expect(result.value?.completedSteps).to.be.an('array').that.is.empty;
    });

    it('should create session with progress estimation', () => {
      const result = sessionManager.createSession('user456', UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      
      expect(result.value?.progress).to.exist;
      expect(result.value?.progress?.totalSteps).to.be.greaterThan(0);
      expect(result.value?.progress?.completedCount).to.equal(0);
      expect(result.value?.progress?.estimatedTimeRemaining).to.be.greaterThan(0);
    });

    it('should create AI agent session with appropriate settings', () => {
      const result = sessionManager.createSession('agent789', UserType.AI_AGENT);
      
      expect(result.value?.userType).to.equal(UserType.AI_AGENT);
      expect(result.value?.progress?.estimatedTimeRemaining).to.be.lessThan(10); // AI sessions should be faster
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session', () => {
      const createResult = sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER);
      const sessionId = createResult.value!.sessionId;
      
      const getResult = sessionManager.getSession(sessionId);
      
      expect(getResult.isSuccess).to.be.true;
      expect(getResult.value?.sessionId).to.equal(sessionId);
    });

    it('should return error for non-existent session', () => {
      const result = sessionManager.getSession('non-existent-id');
      
      expect(result.isSuccess).to.be.false;
      expect(result.error?.code).to.equal('SESSION_NOT_FOUND');
    });
  });

  describe('updateProgress', () => {
    it('should update session progress and time estimation', () => {
      const createResult = sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      const sessionId = createResult.value!.sessionId;
      
      const updateResult = sessionManager.updateProgress(sessionId, 'environment-setup', StepStatus.COMPLETED);
      
      expect(updateResult.isSuccess).to.be.true;
      expect(updateResult.value?.sessionId).to.equal(sessionId);
      expect(updateResult.value?.completedSteps).to.include('environment-setup');
      expect(updateResult.value?.progress?.completedCount).to.equal(1);
    });

    it('should recalculate estimated time remaining', () => {
      const createResult = sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      const sessionId = createResult.value!.sessionId;
      const initialTimeEstimate = createResult.value!.progress!.estimatedTimeRemaining;
      
      sessionManager.updateProgress(sessionId, 'environment-setup', StepStatus.COMPLETED);
      
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession.value?.progress?.estimatedTimeRemaining).to.be.lessThan(initialTimeEstimate);
    });
  });

  describe('persistSession', () => {
    it('should save session data to filesystem', async () => {
      const createResult = sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER);
      const sessionId = createResult.value!.sessionId;
      
      const persistResult = await sessionManager.persistSession(sessionId);
      
      expect(persistResult.isSuccess).to.be.true;
    });

    it('should return error for non-existent session', async () => {
      const result = await sessionManager.persistSession('non-existent-id');
      
      expect(result.isSuccess).to.be.false;
      expect(result.error?.code).to.equal('SESSION_NOT_FOUND');
    });
  });

  describe('resumeSession', () => {
    it('should restore session from filesystem', async () => {
      // Create and persist a session
      const createResult = sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER);
      const sessionId = createResult.value!.sessionId;
      await sessionManager.persistSession(sessionId);
      
      // Clear memory and resume
      sessionManager.clearMemory();
      const resumeResult = await sessionManager.resumeSession(sessionId);
      
      expect(resumeResult.isSuccess).to.be.true;
      expect(resumeResult.value?.sessionId).to.equal(sessionId);
      expect(resumeResult.value?.userId).to.equal('user123');
    });

    it('should return error for non-existent session file', async () => {
      const result = await sessionManager.resumeSession('non-existent-id');
      
      expect(result.isSuccess).to.be.false;
      expect(result.error?.code).to.equal('SESSION_FILE_NOT_FOUND');
    });
  });

  describe('getSessionHistory', () => {
    it('should return list of user sessions', async () => {
      // Create multiple sessions for the same user
      await sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      await sessionManager.createSession('user123', UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      
      const historyResult = sessionManager.getSessionHistory('user123');
      
      expect(historyResult.isSuccess).to.be.true;
      expect(historyResult.value).to.be.an('array');
      expect(historyResult.value?.length).to.equal(2);
    });
  });
});