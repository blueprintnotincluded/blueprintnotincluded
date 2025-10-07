import { describe, it } from 'mocha';
import { expect } from 'chai';
import { OnboardingOrchestrator } from '../orchestrator/onboarding-orchestrator';
import { UserType, DeveloperRole, StepStatus } from '../types';
import { OnboardingError } from '../errors';

describe('OnboardingOrchestrator - Enhanced Error Handling and Recovery', () => {
  let orchestrator: OnboardingOrchestrator;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
  });

  describe('Step Completion with Error Handling', () => {
    it('should complete a step successfully and update progress', async () => {
      // Start session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Complete first step
      const stepResult = await orchestrator.completeStep(session.sessionId, 'environment-setup');
      expect(stepResult.isSuccess).to.be.true;
      
      // Verify step is marked as completed
      const updatedSession = orchestrator.getSession(session.sessionId);
      expect(updatedSession.isSuccess).to.be.true;
      if (updatedSession.isSuccess) {
        expect(updatedSession.value.completedSteps).to.include('environment-setup');
        expect(updatedSession.value.progress?.completedCount).to.equal(1);
      }
    });

    it('should handle step validation failures with retry mechanism', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // First complete the prerequisite step
      await orchestrator.completeStep(session.sessionId, 'environment-setup');
      
      // Attempt to complete step with validation failure
      const stepResult = await orchestrator.completeStep(session.sessionId, 'database-setup', {
        validateConnectionString: 'invalid-connection'
      });
      
      expect(stepResult.isSuccess).to.be.false;
      if (!stepResult.isSuccess) {
        expect(stepResult.error.code).to.equal('STEP_VALIDATION_FAILED');
      }
      
      // Verify session tracks failure count
      const updatedSession = orchestrator.getSession(session.sessionId);
      expect(updatedSession.isSuccess).to.be.true;
      if (updatedSession.isSuccess) {
        expect(updatedSession.value.failureCount).to.be.greaterThan(0);
      }
    });

    it('should implement retry mechanism for transient failures', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.AI_AGENT);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Simulate transient failure followed by success
      const retryResult = await orchestrator.retryFailedStep(session.sessionId, 'context-loading');
      expect(retryResult.isSuccess).to.be.true;
      
      // Verify recovery count is tracked
      const updatedSession = orchestrator.getSession(session.sessionId);
      expect(updatedSession.isSuccess).to.be.true;
      if (updatedSession.isSuccess) {
        expect(updatedSession.value.recoveryCount).to.be.greaterThan(0);
      }
    });
  });

  describe('Progress State Management', () => {
    it('should get current progress state for a session', () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      const progressResult = orchestrator.getProgress(session.sessionId);
      expect(progressResult.isSuccess).to.be.true;
      
      if (progressResult.isSuccess) {
        const progress = progressResult.value;
        expect(progress.sessionId).to.equal(session.sessionId);
        expect(progress.percentComplete).to.equal(0);
        expect(progress.totalSteps).to.be.greaterThan(0);
      }
    });

    it('should handle invalid session ID gracefully', () => {
      const progressResult = orchestrator.getProgress('invalid-session-id');
      expect(progressResult.isSuccess).to.be.false;
      
      if (!progressResult.isSuccess) {
        expect(progressResult.error.code).to.equal('SESSION_NOT_FOUND');
      }
    });
  });

  describe('Session Recovery and State Management', () => {
    it('should save session state to allow recovery after interruption', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Complete some steps
      await orchestrator.completeStep(session.sessionId, 'environment-setup');
      await orchestrator.completeStep(session.sessionId, 'frontend-setup');
      
      // Save session state
      const saveResult = await orchestrator.saveSessionState(session.sessionId);
      expect(saveResult.isSuccess).to.be.true;
      
      // Simulate recovery
      const recoveryResult = await orchestrator.recoverSession(session.sessionId);
      expect(recoveryResult.isSuccess).to.be.true;
      
      if (recoveryResult.isSuccess) {
        const recoveredSession = recoveryResult.value;
        expect(recoveredSession.completedSteps).to.have.length(2);
        expect(recoveredSession.isComplete).to.be.false;
      }
    });

    it('should handle corrupted session data during recovery', async () => {
      // Attempt to recover non-existent session
      const recoveryResult = await orchestrator.recoverSession('corrupted-session-id');
      expect(recoveryResult.isSuccess).to.be.false;
      
      if (!recoveryResult.isSuccess) {
        expect(recoveryResult.error.code).to.equal('SESSION_RECOVERY_FAILED');
      }
    });
  });

  describe('Workflow Transition Handling', () => {
    it('should handle step dependencies and unlock next steps correctly', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Get available steps
      const availableSteps = await orchestrator.getAvailableSteps(session.sessionId);
      expect(availableSteps.isSuccess).to.be.true;
      
      if (availableSteps.isSuccess) {
        expect(availableSteps.value.length).to.be.greaterThan(0);
        expect(availableSteps.value[0].status).to.equal(StepStatus.AVAILABLE);
      }
    });

    it('should prevent completion of steps with unsatisfied dependencies', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.DEVOPS);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Try to complete advanced step without prerequisites
      const stepResult = await orchestrator.completeStep(session.sessionId, 'kubernetes-deployment');
      expect(stepResult.isSuccess).to.be.false;
      
      if (!stepResult.isSuccess) {
        expect(stepResult.error.code).to.equal('PREREQUISITES_NOT_MET');
      }
    });
  });

  describe('Integration with System Components', () => {
    it('should coordinate with documentation manager for step content', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Get step with documentation
      const stepContentResult = await orchestrator.getStepContent(session.sessionId, 'environment-setup');
      expect(stepContentResult.isSuccess).to.be.true;
      
      if (stepContentResult.isSuccess) {
        const stepContent = stepContentResult.value;
        expect(stepContent.title).to.be.a('string');
        expect(stepContent.instructions).to.be.an('array');
        expect(stepContent.codeExamples).to.be.an('array');
      }
    });

    it('should integrate with progress tracker for milestone validation', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.AI_AGENT);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Complete steps and validate milestones
      await orchestrator.completeStep(session.sessionId, 'context-loading');
      await orchestrator.completeStep(session.sessionId, 'schema-validation');
      
      const milestoneResult = await orchestrator.validateMilestone(session.sessionId, 'basic-setup');
      expect(milestoneResult.isSuccess).to.be.true;
    });
  });

  describe('Error Recovery Mechanisms', () => {
    it('should provide graceful degradation when components are unavailable', async () => {
      // Simulate component failure
      const orchestratorWithFailure = new OnboardingOrchestrator();
      orchestratorWithFailure.enableComponentFailureSimulation();
      
      const sessionResult = orchestratorWithFailure.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Attempt operation that requires external component
      const degradedResult = await orchestratorWithFailure.getStepContentWithFallback(session.sessionId, 'database-setup');
      expect(degradedResult.isSuccess).to.be.true;
      
      if (degradedResult.isSuccess) {
        const content = degradedResult.value;
        expect(content.isFallback).to.be.true;
        expect(content.fallbackReason).to.contain('component unavailable');
      }
    });

    it('should reset session to last valid checkpoint on critical failure', async () => {
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Complete some steps
      await orchestrator.completeStep(session.sessionId, 'environment-setup');
      await orchestrator.createCheckpoint(session.sessionId, 'post-environment');
      
      // Simulate critical failure
      const resetResult = await orchestrator.resetToCheckpoint(session.sessionId, 'post-environment');
      expect(resetResult.isSuccess).to.be.true;
      
      if (resetResult.isSuccess) {
        expect(resetResult.value.resetToStep).to.equal('environment-setup');
        expect(resetResult.value.preservedProgress).to.be.true;
      }
    });
  });
});