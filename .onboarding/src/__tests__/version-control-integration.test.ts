import { expect } from 'chai';
import { VersionControlIntegration } from '../integration/version-control-integration';
import { GitChangeEvent, WebhookEvent, DocumentationSyncResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

describe('Version Control Integration', () => {
  let vcIntegration: VersionControlIntegration;
  const testRepoPath = path.join(__dirname, '../../../');

  beforeEach(() => {
    vcIntegration = new VersionControlIntegration(testRepoPath);
  });

  describe('Git Repository Monitoring', () => {
    it('should detect git repository and initialize monitoring', async () => {
      const initResult = await vcIntegration.initializeGitMonitoring();
      if (!initResult.isSuccess) {
        console.log('Init failed:', initResult.error?.message);
      }
      expect(initResult.isSuccess).to.be.true;
      expect(initResult.value?.isGitRepository).to.be.true;
      expect(initResult.value?.repositoryPath).to.include('blueprintnotincluded');
    });

    it('should fail initialization for non-git directory', async () => {
      const nonGitVc = new VersionControlIntegration('/tmp');
      const initResult = await nonGitVc.initializeGitMonitoring();
      expect(initResult.isSuccess).to.be.false;
      expect(initResult.error?.message).to.include('not a git repository');
    });

    it('should detect file changes in the repository', async () => {
      // Initialize monitoring
      await vcIntegration.initializeGitMonitoring();
      
      // Mock a file change
      const changeEvent = await vcIntegration.detectChanges();
      expect(changeEvent.isSuccess).to.be.true;
      
      if (changeEvent.isSuccess && changeEvent.value) {
        expect(changeEvent.value.hasChanges).to.be.a('boolean');
        expect(changeEvent.value.changedFiles).to.be.an('array');
        expect(changeEvent.value.timestamp).to.be.a('date');
      }
    });

    it('should identify documentation-relevant changes', async () => {
      await vcIntegration.initializeGitMonitoring();
      
      // Test with documentation file changes
      const docChanges = await vcIntegration.analyzeChangeRelevance([
        'README.md',
        'AGENTS.md', 
        'app/api/blueprint-controller.ts',
        'frontend/src/app/component.ts'
      ]);
      
      expect(docChanges.isSuccess).to.be.true;
      if (docChanges.isSuccess && docChanges.value) {
        expect(docChanges.value.requiresDocumentationUpdate).to.be.a('boolean');
        expect(docChanges.value.affectedDocuments).to.be.an('array');
        expect(docChanges.value.changeCategory).to.be.oneOf(['documentation', 'code', 'config', 'mixed']);
      }
    });
  });

  describe('Automatic Documentation Update Triggers', () => {
    it('should trigger documentation update for API changes', async () => {
      await vcIntegration.initializeGitMonitoring();
      
      const apiFiles = ['app/api/blueprint-controller.ts', 'app/api/auth.ts'];
      const updateTrigger = await vcIntegration.triggerDocumentationUpdate(apiFiles);
      
      expect(updateTrigger.isSuccess).to.be.true;
      if (updateTrigger.isSuccess && updateTrigger.value) {
        expect(updateTrigger.value.triggered).to.be.true;
        expect(updateTrigger.value.updateType).to.equal('api-documentation');
        expect(updateTrigger.value.affectedFiles).to.include.members(apiFiles);
      }
    });

    it('should not trigger updates for non-relevant changes', async () => {
      await vcIntegration.initializeGitMonitoring();
      
      const nonRelevantFiles = ['frontend/src/styles.css', 'package-lock.json'];
      const updateTrigger = await vcIntegration.triggerDocumentationUpdate(nonRelevantFiles);
      
      expect(updateTrigger.isSuccess).to.be.true;
      if (updateTrigger.isSuccess && updateTrigger.value) {
        expect(updateTrigger.value.triggered).to.be.false;
        expect(updateTrigger.value.reason).to.include('no documentation impact');
      }
    });

    it('should generate update tasks for different change types', async () => {
      await vcIntegration.initializeGitMonitoring();
      
      const mixedChanges = [
        'app/api/models/blueprint.ts',  // Model change
        'frontend/src/app/services/api.service.ts',  // Service change
        'README.md'  // Documentation change
      ];
      
      const tasks = await vcIntegration.generateDocumentationTasks(mixedChanges);
      expect(tasks.isSuccess).to.be.true;
      
      if (tasks.isSuccess && tasks.value) {
        expect(tasks.value.length).to.be.greaterThan(0);
        expect(tasks.value.some(task => task.type === 'api-schema-update')).to.be.true;
        expect(tasks.value.some(task => task.type === 'architecture-documentation')).to.be.true;
      }
    });
  });

  describe('Webhook Registration and Event Handling', () => {
    it('should register webhook for repository events', async () => {
      const webhookEvents: WebhookEvent[] = ['push', 'pull_request', 'release'];
      const registration = await vcIntegration.registerWebhooks(webhookEvents);
      
      expect(registration.isSuccess).to.be.true;
      if (registration.isSuccess && registration.value) {
        expect(registration.value.webhookId).to.be.a('string');
        expect(registration.value.events).to.deep.equal(webhookEvents);
        expect(registration.value.endpointUrl).to.include('/onboarding/webhook');
      }
    });

    it('should handle push event webhooks', async () => {
      const pushEvent = {
        type: 'push' as WebhookEvent,
        repository: 'blueprintnotincluded',
        branch: 'master',
        commits: [
          {
            id: 'abc123',
            message: 'Add new API endpoint',
            modified: ['app/api/blueprints.ts'],
            added: [],
            removed: []
          }
        ],
        timestamp: new Date()
      };
      
      const handleResult = await vcIntegration.handleWebhookEvent(pushEvent);
      expect(handleResult.isSuccess).to.be.true;
      
      if (handleResult.isSuccess && handleResult.value) {
        expect(handleResult.value.processed).to.be.true;
        expect(handleResult.value.actionsTaken).to.be.an('array');
        expect(handleResult.value.documentationUpdatesTriggered).to.be.a('boolean');
      }
    });

    it('should handle pull request webhook events', async () => {
      const prEvent = {
        type: 'pull_request' as WebhookEvent,
        action: 'opened',
        pullRequest: {
          number: 42,
          title: 'Update authentication flow',
          changedFiles: ['app/api/auth.ts', 'frontend/src/app/auth.service.ts']
        },
        timestamp: new Date()
      };
      
      const handleResult = await vcIntegration.handleWebhookEvent(prEvent);
      expect(handleResult.isSuccess).to.be.true;
      
      if (handleResult.isSuccess && handleResult.value) {
        expect(handleResult.value.processed).to.be.true;
        expect(handleResult.value.prAnalysis).to.exist;
        expect(handleResult.value.prAnalysis?.requiresDocumentationReview).to.be.a('boolean');
      }
    });
  });

  describe('Code-Documentation Synchronization', () => {
    it('should sync API changes with documentation', async () => {
      await vcIntegration.initializeGitMonitoring();
      
      const apiChanges = ['app/api/blueprint-controller.ts'];
      const syncResult = await vcIntegration.synchronizeDocumentation(apiChanges);
      
      expect(syncResult.isSuccess).to.be.true;
      if (syncResult.isSuccess && syncResult.value) {
        expect(syncResult.value.documentationPath).to.include('AGENTS.md');
        expect(syncResult.value.syncStatus).to.be.oneOf(['success', 'partial', 'failed']);
        expect(syncResult.value.updatedSections).to.be.an('array');
      }
    });

    it('should validate documentation freshness against codebase', async () => {
      const freshnessCheck = await vcIntegration.validateDocumentationFreshness();
      
      expect(freshnessCheck.isSuccess).to.be.true;
      if (freshnessCheck.isSuccess && freshnessCheck.value) {
        expect(freshnessCheck.value.isUpToDate).to.be.a('boolean');
        expect(freshnessCheck.value.staleDocuments).to.be.an('array');
        expect(freshnessCheck.value.lastSyncTimestamp).to.be.a('date');
      }
    });

    it('should generate documentation update recommendations', async () => {
      const recentChanges = [
        'app/api/models/user.ts',
        'frontend/src/app/components/blueprint-editor.component.ts'
      ];
      
      const recommendations = await vcIntegration.generateUpdateRecommendations(recentChanges);
      
      expect(recommendations.isSuccess).to.be.true;
      if (recommendations.isSuccess && recommendations.value) {
        expect(recommendations.value.length).to.be.greaterThan(0);
        expect(recommendations.value[0].priority).to.be.oneOf(['high', 'medium', 'low']);
        expect(recommendations.value[0].section).to.be.a('string');
        expect(recommendations.value[0].suggestedChanges).to.be.a('string');
      }
    });

    it('should maintain change history for documentation tracking', async () => {
      await vcIntegration.initializeGitMonitoring();
      
      const history = await vcIntegration.getDocumentationChangeHistory();
      
      expect(history.isSuccess).to.be.true;
      if (history.isSuccess && history.value) {
        expect(history.value.changes).to.be.an('array');
        expect(history.value.totalChanges).to.be.a('number');
        
        if (history.value.changes.length > 0) {
          const change = history.value.changes[0];
          expect(change.timestamp).to.be.a('date');
          expect(change.type).to.be.oneOf(['code', 'documentation', 'sync']);
          expect(change.files).to.be.an('array');
        }
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle git command failures gracefully', async () => {
      // Mock a git command failure scenario
      const invalidVc = new VersionControlIntegration('/invalid/path');
      const result = await invalidVc.detectChanges();
      
      expect(result.isSuccess).to.be.false;
      expect(result.error?.message).to.include('git operation failed');
      expect(result.error?.code).to.equal('GIT_ERROR');
    });

    it('should recover from webhook registration failures', async () => {
      // Test webhook registration with invalid configuration
      const invalidWebhooks = ['invalid_event' as WebhookEvent];
      const registration = await vcIntegration.registerWebhooks(invalidWebhooks);
      
      expect(registration.isSuccess).to.be.false;
      expect(registration.error?.message).to.include('invalid webhook event');
    });

    it('should provide fallback when documentation sync fails', async () => {
      // Test sync with files that don't exist
      const nonExistentFiles = ['non/existent/file.ts'];
      const syncResult = await vcIntegration.synchronizeDocumentation(nonExistentFiles);
      
      expect(syncResult.isSuccess).to.be.true;  // Should not fail completely
      if (syncResult.isSuccess && syncResult.value) {
        expect(syncResult.value.syncStatus).to.equal('failed');
        expect(syncResult.value.errorMessage).to.be.a('string');
        expect(syncResult.value.fallbackAction).to.be.oneOf(['manual_update', 'skip', 'retry']);
      }
    });
  });
});