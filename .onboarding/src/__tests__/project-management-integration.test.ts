import { expect } from 'chai';
import { ProjectManagementIntegration } from '../integration/project-management-integration';
import { OnboardingSession, DeveloperRole, UserType } from '../types';

describe('ProjectManagementIntegration', () => {
  let integration: ProjectManagementIntegration;
  let mockSession: OnboardingSession;

  beforeEach(() => {
    integration = new ProjectManagementIntegration();
    mockSession = {
      sessionId: 'test-session-1',
      userId: 'user-1',
      userType: UserType.HUMAN_DEVELOPER,
      developerRole: DeveloperRole.FRONTEND,
      startTime: new Date(),
      lastActivity: new Date(),
      currentStep: 'setup',
      completedSteps: [],
      isComplete: false,
      progress: {
        totalSteps: 10,
        completedCount: 0,
        estimatedTimeRemaining: 60
      }
    };
  });

  describe('syncWithProjectTools', () => {
    it('should integrate with JIRA platform', async () => {
      const config = {
        platform: 'jira' as const,
        apiUrl: 'https://test.atlassian.net',
        credentials: { token: 'test-token', user: 'test@example.com' },
        projectKey: 'TEST'
      };

      const result = await integration.syncWithProjectTools(config);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value).to.deep.include({
        platform: 'jira',
        connected: true,
        syncStatus: 'success'
      });
    });

    it('should integrate with GitHub Issues platform', async () => {
      const config = {
        platform: 'github' as const,
        apiUrl: 'https://api.github.com',
        credentials: { token: 'github-token' },
        repository: 'owner/repo'
      };

      const result = await integration.syncWithProjectTools(config);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value).to.deep.include({
        platform: 'github',
        connected: true,
        syncStatus: 'success'
      });
    });

    it('should handle authentication failures gracefully', async () => {
      const config = {
        platform: 'jira' as const,
        apiUrl: 'https://test.atlassian.net',
        credentials: { token: 'invalid-token', user: 'test@example.com' },
        projectKey: 'TEST'
      };

      const result = await integration.syncWithProjectTools(config);
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Authentication failed');
    });
  });

  describe('createOnboardingTasks', () => {
    it('should create onboarding tasks in project management system', async () => {
      const config = {
        platform: 'jira' as const,
        projectKey: 'TEST',
        taskTemplate: 'onboarding'
      };

      const result = await integration.createOnboardingTasks(mockSession, config);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.tasksCreated).to.be.greaterThan(0);
      expect(result.value?.taskIds).to.be.an('array');
    });

    it('should customize tasks based on developer role', async () => {
      const frontendSession = { ...mockSession, developerRole: DeveloperRole.FRONTEND };
      const backendSession = { ...mockSession, developerRole: DeveloperRole.BACKEND };
      
      const config = {
        platform: 'github' as const,
        repository: 'owner/repo',
        taskTemplate: 'role-specific'
      };

      const frontendResult = await integration.createOnboardingTasks(frontendSession, config);
      const backendResult = await integration.createOnboardingTasks(backendSession, config);
      
      expect(frontendResult.isSuccess).to.be.true;
      expect(backendResult.isSuccess).to.be.true;
      expect(frontendResult.value?.taskIds).to.not.deep.equal(backendResult.value?.taskIds);
    });
  });

  describe('trackProgress', () => {
    it('should update project management tasks when onboarding progresses', async () => {
      // First create tasks for the session
      const taskConfig = {
        platform: 'github' as const,
        repository: 'owner/repo',
        taskTemplate: 'onboarding'
      };
      
      await integration.createOnboardingTasks(mockSession, taskConfig);
      
      const progressUpdate = {
        sessionId: mockSession.sessionId,
        currentStep: 'environment-setup',
        previousStep: 'introduction',
        nextStep: 'repository-clone',
        percentComplete: 25,
        unlockedSteps: ['environment-setup', 'repository-clone'],
        timestamp: new Date()
      };

      const result = await integration.trackProgress(progressUpdate);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.updatedTasks).to.be.greaterThan(0);
    });

    it('should handle progress tracking errors gracefully', async () => {
      const invalidUpdate = {
        sessionId: 'invalid-session',
        currentStep: 'unknown-step',
        percentComplete: 150, // Invalid percentage
        unlockedSteps: [],
        timestamp: new Date()
      };

      const result = await integration.trackProgress(invalidUpdate);
      
      expect(result.isSuccess).to.be.false;
      expect(result.error).to.include('Invalid progress update');
    });
  });

  describe('generateMetrics', () => {
    it('should export onboarding metrics for project management dashboards', async () => {
      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31')
      };

      const result = await integration.generateMetrics(timeRange);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value).to.have.property('totalOnboardings');
      expect(result.value).to.have.property('averageCompletionTime');
      expect(result.value).to.have.property('successRate');
      expect(result.value).to.have.property('roleBreakdown');
    });

    it('should include common blocking points in metrics', async () => {
      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31')
      };

      const result = await integration.generateMetrics(timeRange);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.commonBlockingPoints).to.be.an('array');
    });
  });
});