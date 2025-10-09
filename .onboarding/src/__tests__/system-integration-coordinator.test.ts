import { describe, it } from 'mocha';
import { expect } from 'chai';
import { SystemIntegrationCoordinator } from '../coordinator/system-integration-coordinator';
import { OnboardingOrchestrator } from '../orchestrator/onboarding-orchestrator';
import { DocumentationManager } from '../managers/documentation-manager';
import { VersionControlIntegration } from '../integration/version-control-integration';
import { UserType, DeveloperRole } from '../types';

describe('SystemIntegrationCoordinator - Component Coordination', () => {
  let coordinator: SystemIntegrationCoordinator;
  let orchestrator: OnboardingOrchestrator;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
    coordinator = new SystemIntegrationCoordinator({
      orchestrator,
      projectPath: '/test/project'
    });
  });

  describe('Component Registration and Health Monitoring', () => {
    it('should register and initialize all system components', async () => {
      const initResult = await coordinator.initializeSystem();
      expect(initResult.isSuccess).to.be.true;
      
      if (initResult.isSuccess) {
        const status = initResult.value;
        expect(status.componentsInitialized).to.include('orchestrator');
        expect(status.componentsInitialized).to.include('documentationManager');
        expect(status.componentsInitialized).to.include('versionControl');
        expect(status.healthStatus).to.equal('healthy');
      }
    });

    it('should monitor component health and detect failures', async () => {
      await coordinator.initializeSystem();
      
      const healthCheck = await coordinator.performHealthCheck();
      expect(healthCheck.isSuccess).to.be.true;
      
      if (healthCheck.isSuccess) {
        const health = healthCheck.value;
        expect(health.overallStatus).to.be.oneOf(['healthy', 'degraded', 'critical']);
        expect(health.componentStatus).to.have.property('orchestrator');
        expect(health.componentStatus).to.have.property('documentationManager');
      }
    });

    it('should handle component initialization failures gracefully', async () => {
      // Simulate initialization with invalid project path
      const coordinatorWithBadPath = new SystemIntegrationCoordinator({
        orchestrator,
        projectPath: '/invalid/path'
      });
      
      const initResult = await coordinatorWithBadPath.initializeSystem();
      expect(initResult.isSuccess).to.be.true; // Should succeed with partial initialization
      
      if (initResult.isSuccess) {
        const status = initResult.value;
        expect(status.healthStatus).to.be.oneOf(['degraded', 'critical']);
        expect(status.failedComponents).to.include('versionControl');
      }
    });
  });

  describe('Data Flow Management', () => {
    it('should coordinate data flow between onboarding and documentation', async () => {
      await coordinator.initializeSystem();
      
      // Start onboarding session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Test coordinated step completion with documentation integration
      const dataFlowResult = await coordinator.coordinateStepCompletion(
        session.sessionId, 
        'environment-setup'
      );
      
      expect(dataFlowResult.isSuccess).to.be.true;
      if (dataFlowResult.isSuccess) {
        expect(dataFlowResult.value.stepCompleted).to.be.true;
        expect(dataFlowResult.value.documentationUpdated).to.be.true;
        expect(dataFlowResult.value.progressTracked).to.be.true;
      }
    });

    it('should synchronize progress data across components', async () => {
      await coordinator.initializeSystem();
      
      const sessionResult = orchestrator.startOnboarding(UserType.AI_AGENT);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess) return;
      const session = sessionResult.value;
      
      // Complete multiple steps
      await orchestrator.completeStep(session.sessionId, 'context-loading');
      await orchestrator.completeStep(session.sessionId, 'schema-validation');
      
      // Test data synchronization
      const syncResult = await coordinator.synchronizeComponentData(session.sessionId);
      expect(syncResult.isSuccess).to.be.true;
      
      if (syncResult.isSuccess) {
        expect(syncResult.value.dataSynchronized).to.be.true;
        expect(syncResult.value.componentsUpdated).to.include('documentationManager');
        expect(syncResult.value.componentsUpdated).to.include('progressTracker');
      }
    });
  });

  describe('Event Handling and Notification Distribution', () => {
    it('should distribute events to all interested components', async () => {
      await coordinator.initializeSystem();
      
      const eventData = {
        type: 'step_completed' as const,
        sessionId: 'test-session',
        stepId: 'environment-setup',
        timestamp: new Date(),
        userType: UserType.HUMAN_DEVELOPER
      };
      
      const eventResult = await coordinator.distributeEvent(eventData);
      expect(eventResult.isSuccess).to.be.true;
      
      if (eventResult.isSuccess) {
        expect(eventResult.value.eventDistributed).to.be.true;
        expect(eventResult.value.handlersNotified).to.be.greaterThan(0);
        expect(eventResult.value.failedHandlers).to.have.length(0);
      }
    });

    it('should handle event distribution failures gracefully', async () => {
      await coordinator.initializeSystem();
      
      // Simulate component failure
      coordinator.simulateComponentFailure('documentationManager');
      
      const eventData = {
        type: 'milestone_achieved' as const,
        sessionId: 'test-session',
        milestoneId: 'basic-setup',
        timestamp: new Date(),
        userType: UserType.AI_AGENT
      };
      
      const eventResult = await coordinator.distributeEvent(eventData);
      expect(eventResult.isSuccess).to.be.true; // Should continue despite failures
      
      if (eventResult.isSuccess) {
        expect(eventResult.value.failedHandlers).to.have.length.greaterThan(0);
        expect(eventResult.value.eventDistributed).to.be.true;
      }
    });
  });

  describe('Component Status Tracking', () => {
    it('should track component status and availability', async () => {
      await coordinator.initializeSystem();
      
      const statusResult = await coordinator.getComponentStatus();
      expect(statusResult.isSuccess).to.be.true;
      
      if (statusResult.isSuccess) {
        const status = statusResult.value;
        expect(status.totalComponents).to.be.greaterThan(0);
        expect(status.healthyComponents).to.be.greaterThan(0);
        expect(status.components).to.have.property('orchestrator');
        expect(status.components.orchestrator.status).to.be.oneOf(['healthy', 'degraded', 'failed']);
      }
    });

    it('should detect and report component degradation', async () => {
      await coordinator.initializeSystem();
      
      // Simulate gradual component degradation
      coordinator.simulateComponentDegradation('versionControl', 0.5);
      
      const statusResult = await coordinator.getComponentStatus();
      expect(statusResult.isSuccess).to.be.true;
      
      if (statusResult.isSuccess) {
        const status = statusResult.value;
        expect(status.components.versionControl.status).to.equal('degraded');
        expect(status.components.versionControl.healthScore).to.be.lessThan(1.0);
      }
    });
  });

  describe('Workflow Coordination', () => {
    it('should coordinate complex multi-component workflows', async () => {
      await coordinator.initializeSystem();
      
      const workflowData = {
        sessionId: 'workflow-test',
        userType: UserType.HUMAN_DEVELOPER,
        role: DeveloperRole.FULLSTACK,
        workflowType: 'complete_onboarding' as const
      };
      
      const workflowResult = await coordinator.executeWorkflow(workflowData);
      expect(workflowResult.isSuccess).to.be.true;
      
      if (workflowResult.isSuccess) {
        expect(workflowResult.value.workflowCompleted).to.be.true;
        expect(workflowResult.value.stepsExecuted).to.be.greaterThan(0);
        expect(workflowResult.value.componentsInvolved).to.include('orchestrator');
        expect(workflowResult.value.componentsInvolved).to.include('documentationManager');
      }
    });

    it('should handle workflow interruptions and provide recovery options', async () => {
      await coordinator.initializeSystem();
      
      const workflowData = {
        sessionId: 'interruption-test',
        userType: UserType.HUMAN_DEVELOPER,
        role: DeveloperRole.BACKEND,
        workflowType: 'complete_onboarding' as const
      };
      
      // Start workflow
      const workflowPromise = coordinator.executeWorkflow(workflowData);
      
      // Simulate interruption
      setTimeout(() => coordinator.interruptWorkflow('interruption-test', 'user_cancellation'), 10);
      
      const result = await workflowPromise;
      expect(result.isSuccess).to.be.true;
      
      if (result.isSuccess) {
        expect(result.value.workflowInterrupted).to.be.true;
        expect(result.value.recoveryOptions).to.be.an('array');
        expect(result.value.recoveryOptions).to.include('resume');
        expect(result.value.recoveryOptions).to.include('restart');
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should implement circuit breaker pattern for failed components', async () => {
      await coordinator.initializeSystem();
      
      // Simulate repeated failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await coordinator.simulateComponentFailure('versionControl');
      }
      
      const circuitStatus = await coordinator.getCircuitBreakerStatus('versionControl');
      expect(circuitStatus.isSuccess).to.be.true;
      
      if (circuitStatus.isSuccess) {
        expect(circuitStatus.value.state).to.be.oneOf(['open', 'half-open', 'closed']);
        expect(circuitStatus.value.failureCount).to.be.greaterThan(0);
      }
    });

    it('should automatically recover components when possible', async () => {
      await coordinator.initializeSystem();
      
      // Simulate failure
      coordinator.simulateComponentFailure('documentationManager');
      
      // Trigger recovery
      const recoveryResult = await coordinator.attemptComponentRecovery('documentationManager');
      expect(recoveryResult.isSuccess).to.be.true;
      
      if (recoveryResult.isSuccess) {
        expect(recoveryResult.value.recoveryAttempted).to.be.true;
        expect(recoveryResult.value.recoverySuccessful).to.be.true;
        expect(recoveryResult.value.componentStatus).to.equal('healthy');
      }
    });
  });
});