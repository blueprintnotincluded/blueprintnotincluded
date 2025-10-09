import { expect } from 'chai';
import { IntegrationManager } from '../../src/onboarding/IntegrationManager';
import { OnboardingMetrics, SyncStatus, WebhookEvent, WebhookRegistration } from '../../src/onboarding/types/Integration';

describe('Tool Integration and Workflow Automation (Task 7)', () => {
  let integrationManager: IntegrationManager;
  const testProjectPath = process.cwd();

  beforeEach(() => {
    integrationManager = new IntegrationManager(testProjectPath);
  });

  describe('Task 7.3: Project management tool integration', () => {
    it('should sync onboarding tasks with project management platforms', async () => {
      const result = await integrationManager.syncWithProjectManagement({
        platform: 'github',
        repositoryUrl: 'https://github.com/test/repo',
        apiToken: 'test-token'
      });

      expect(result.success).to.be.true;
      expect(result.tasksCreated).to.be.a('number');
      expect(result.tasksUpdated).to.be.a('number');
    });

    it('should track onboarding progress and report to team management tools', async () => {
      const sessionId = 'test-session-123';
      const result = await integrationManager.reportProgressToTeamTools(sessionId, {
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/test',
        channel: '#onboarding'
      });

      expect(result.success).to.be.true;
      expect(result.messagesSent).to.be.a('number');
    });

    it('should export onboarding metrics and dashboard data', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31')
      };

      const metrics: OnboardingMetrics = await integrationManager.exportMetrics(timeRange);

      expect(metrics.totalOnboardings).to.be.a('number');
      expect(metrics.averageCompletionTime).to.be.a('number');
      expect(metrics.successRate).to.be.a('number');
      expect(metrics.commonBlockingPoints).to.be.an('array');
      expect(metrics.roleBreakdown).to.be.a('map');
    });

    it('should integrate with issue tracking systems', async () => {
      const result = await integrationManager.createOnboardingIssue({
        platform: 'jira',
        projectKey: 'ON',
        issueType: 'Task',
        title: 'Complete Developer Onboarding',
        description: 'New developer onboarding checklist',
        assignee: 'john.doe@company.com'
      });

      expect(result.success).to.be.true;
      expect(result.issueId).to.be.a('string');
      expect(result.issueUrl).to.be.a('string');
    });
  });

  describe('Task 7.4: Plugin system and custom integration support', () => {
    it('should register and manage custom integration plugins', async () => {
      const plugin = {
        name: 'custom-slack-integration',
        version: '1.0.0',
        type: 'notification' as const,
        entryPoint: './plugins/slack-integration.js',
        config: {
          webhookUrl: 'https://hooks.slack.com/custom',
          channels: ['#general', '#dev-team']
        }
      };

      const result = await integrationManager.registerPlugin(plugin);

      expect(result.success).to.be.true;
      expect(result.pluginId).to.be.a('string');
      expect(result.status).to.equal('active');
    });

    it('should execute plugin lifecycle management', async () => {
      // First register a plugin
      const plugin = {
        name: 'test-lifecycle-plugin',
        version: '1.0.0',
        type: 'notification' as const,
        entryPoint: './plugins/test-plugin.js'
      };

      const registerResult = await integrationManager.registerPlugin(plugin);
      expect(registerResult.success).to.be.true;
      const pluginId = registerResult.pluginId;
      
      // Test plugin activation
      const activateResult = await integrationManager.activatePlugin(pluginId);
      expect(activateResult.success).to.be.true;
      expect(activateResult.status).to.equal('active');

      // Test plugin deactivation
      const deactivateResult = await integrationManager.deactivatePlugin(pluginId);
      expect(deactivateResult.success).to.be.true;
      expect(deactivateResult.status).to.equal('inactive');

      // Test plugin removal
      const removeResult = await integrationManager.removePlugin(pluginId);
      expect(removeResult.success).to.be.true;
    });

    it('should validate plugin security and compatibility', async () => {
      const plugin = {
        name: 'untrusted-plugin',
        version: '1.0.0',
        type: 'integration' as const,
        entryPoint: './malicious/script.js',
        permissions: ['file-system', 'network', 'process']
      };

      const validationResult = await integrationManager.validatePlugin(plugin);

      expect(validationResult.isValid).to.be.a('boolean');
      expect(validationResult.securityChecks).to.be.an('array');
      expect(validationResult.compatibilityChecks).to.be.an('array');
      expect(validationResult.warnings).to.be.an('array');
    });

    it('should provide extension APIs for custom integrations', async () => {
      const customIntegration = {
        name: 'custom-dashboard',
        endpoints: ['/api/metrics', '/api/progress'],
        hooks: ['onboarding.started', 'onboarding.completed'],
        permissions: ['read-sessions', 'read-metrics']
      };

      const apiResult = await integrationManager.createExtensionAPI(customIntegration);

      expect(apiResult.success).to.be.true;
      expect(apiResult.apiKey).to.be.a('string');
      expect(apiResult.endpoints).to.be.an('array');
    });

    it('should handle plugin errors and recovery', async () => {
      const faultyPluginId = 'faulty-plugin-456';
      
      // Simulate plugin error
      const errorResult = await integrationManager.handlePluginError(faultyPluginId, {
        type: 'runtime-error',
        message: 'Plugin crashed during execution',
        stack: 'Error stack trace',
        timestamp: new Date(),
        pluginId: faultyPluginId
      });

      expect(errorResult.handled).to.be.true;
      expect(errorResult.action).to.be.oneOf(['retry', 'disable', 'remove']);
      expect(errorResult.recoveryAttempted).to.be.a('boolean');
    });
  });

  describe('Webhook and event handling', () => {
    it('should register webhooks for repository events', async () => {
      const events: string[] = ['push', 'pull_request', 'issue'];
      const registration: WebhookRegistration = await integrationManager.registerWebhooks(events);

      expect(registration.success).to.be.true;
      expect(registration.webhookIds).to.be.an('array');
      expect(registration.endpoints).to.be.an('array');
    });

    it('should handle incoming webhook events', async () => {
      const webhookPayload = {
        event: 'push',
        repository: {
          name: 'test-repo',
          url: 'https://github.com/test/repo'
        },
        commits: [
          {
            id: 'abc123',
            message: 'Update documentation',
            modified: ['README.md', 'docs/setup.md']
          }
        ]
      };

      const result = await integrationManager.handleWebhookEvent(webhookPayload);

      expect(result.processed).to.be.true;
      expect(result.actions).to.be.an('array');
    });
  });

  describe('CI/CD Integration', () => {
    it('should integrate with continuous integration pipelines', async () => {
      const buildInfo = {
        buildId: 'build-123',
        branch: 'main',
        commit: 'abc123def',
        status: 'success' as const,
        artifacts: ['docs.zip', 'coverage-report.html'],
        timestamp: new Date()
      };

      const result = await integrationManager.updateFromCI(buildInfo);

      expect(result.success).to.be.true;
      expect(result.documentsUpdated).to.be.a('number');
      expect(result.validationTriggered).to.be.a('boolean');
    });

    it('should trigger documentation validation in CI/CD', async () => {
      const validationResult = await integrationManager.triggerDocumentationValidation({
        branch: 'feature/new-docs',
        files: ['docs/new-feature.md', 'README.md'],
        strictMode: true
      });

      expect(validationResult.success).to.be.a('boolean');
      expect(validationResult.errors).to.be.an('array');
      expect(validationResult.warnings).to.be.an('array');
      expect(validationResult.duration).to.be.a('number');
    });
  });
});