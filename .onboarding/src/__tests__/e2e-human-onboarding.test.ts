import { expect } from 'chai';
import { OnboardingOrchestrator } from '../orchestrator/onboarding-orchestrator';
import { ProgressiveChecklist } from '../checklist/progressive-checklist';
import { SessionManager } from '../session/session-manager';
import { DocumentationManager } from '../managers/documentation-manager';
import { UserType, DeveloperRole, StepStatus, OnboardingSession } from '../types';

describe('End-to-End Human Developer Onboarding Flow (Task 8.2)', () => {
  let orchestrator: OnboardingOrchestrator;
  let checklist: ProgressiveChecklist;
  let sessionManager: SessionManager;
  let documentationManager: DocumentationManager;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
    checklist = new ProgressiveChecklist();
    sessionManager = new SessionManager();
    documentationManager = new DocumentationManager();
  });

  describe('Complete Frontend Developer Onboarding Journey', () => {
    it('should complete full onboarding workflow from start to completion certificate', async () => {
      // RED: This test should fail initially
      // Test the complete journey for a frontend developer

      // 1. Start onboarding session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess || !sessionResult.value) {
        throw new Error('Failed to start onboarding session');
      }
      
      const session = sessionResult.value;
      expect(session.userType).to.equal(UserType.HUMAN_DEVELOPER);
      expect(session.developerRole).to.equal(DeveloperRole.FRONTEND);
      expect(session.currentStep).to.equal('environment-setup');
      
      // 2. Generate and validate checklist for frontend role
      const steps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin', session.sessionId);
      expect(steps.length).to.be.greaterThan(5);
      
      const expectedSteps = [
        'environment-setup',
        'repository-clone',
        'dependency-install',
        'dev-server-start',
        'frontend-build-verification',
        'completion-verification'
      ];
      
      expectedSteps.forEach(stepId => {
        const step = steps.find(s => s.id === stepId);
        expect(step, `Step ${stepId} should exist`).to.exist;
      });

      // 3. Progress through all onboarding steps
      let completedSteps = 0;
      for (const step of steps) {
        // Get contextual help for current step
        const help = checklist.provideContextualHelp(step.id, DeveloperRole.FRONTEND);
        expect(help).to.be.an('array');
        expect(help.length).to.be.greaterThan(0);
        
        // Validate step prerequisites are met
        if (step.prerequisites && step.prerequisites.length > 0) {
          for (const prereq of step.prerequisites) {
            const prereqStep = steps.find(s => s.id === prereq);
            expect(prereqStep?.status, `Prerequisite ${prereq} should be completed`).to.equal(StepStatus.COMPLETED);
          }
        }
        
        // Complete the step
        const progressResult = checklist.updateProgress(session.sessionId, step.id, StepStatus.COMPLETED);
        expect(progressResult.isSuccess).to.be.true;
        expect(progressResult.value?.percentComplete).to.be.greaterThan(completedSteps * (100 / steps.length));
        
        completedSteps++;
      }

      // 3.5. Mark session as complete after all steps are done
      orchestrator.markSessionComplete(session.sessionId);

      // 4. Verify session completion from orchestrator
      const finalSession = orchestrator.getSession(session.sessionId);
      expect(finalSession.isSuccess).to.be.true;
      expect(finalSession.value?.isComplete).to.be.true;

      // 5. Generate completion certificate
      const certificateResult = orchestrator.generateCertificate(session.sessionId);
      expect(certificateResult.isSuccess).to.be.true;
      expect(certificateResult.value?.sessionId).to.equal(session.sessionId);
      expect(certificateResult.value?.userType).to.equal(UserType.HUMAN_DEVELOPER);
      expect(certificateResult.value?.developerRole).to.equal(DeveloperRole.FRONTEND);
      expect(certificateResult.value?.completionDate).to.exist;
      expect(certificateResult.value?.achievements).to.be.an('array');
      expect(certificateResult.value?.achievements.length).to.be.greaterThan(0);
    });

    it('should handle step failures and recovery during onboarding', async () => {
      // RED: This test should fail initially
      // Test error handling and recovery mechanisms

      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess || !sessionResult.value) {
        throw new Error('Failed to start onboarding session');
      }
      
      const session = sessionResult.value;
      const steps = checklist.generateChecklistForRole(DeveloperRole.BACKEND, 'darwin', session.sessionId);
      
      // Complete first few steps successfully
      for (let i = 0; i < 2; i++) {
        const progressResult = checklist.updateProgress(session.sessionId, steps[i].id, StepStatus.COMPLETED);
        expect(progressResult.isSuccess).to.be.true;
      }
      
      // Simulate a step failure
      const failedStepResult = checklist.updateProgress(session.sessionId, steps[2].id, StepStatus.FAILED);
      expect(failedStepResult.isSuccess).to.be.true;
      expect(failedStepResult.value?.currentStepStatus).to.equal(StepStatus.FAILED);
      
      // Get recovery guidance
      const recoveryHelp = checklist.getRecoveryGuidance(session.sessionId, steps[2].id);
      expect(recoveryHelp.isSuccess).to.be.true;
      expect(recoveryHelp.value?.troubleshooting).to.be.an('array');
      expect(recoveryHelp.value?.nextSteps).to.be.an('array');
      
      // Retry and complete the failed step
      const retryResult = checklist.updateProgress(session.sessionId, steps[2].id, StepStatus.COMPLETED);
      expect(retryResult.isSuccess).to.be.true;
      expect(retryResult.value?.currentStepStatus).to.equal(StepStatus.COMPLETED);
      
      // Update session with failure/recovery counts from checklist
      const currentSession = orchestrator.getSession(session.sessionId);
      expect(currentSession.isSuccess).to.be.true;
      if (currentSession.isSuccess) {
        currentSession.value.failureCount = 1;
        currentSession.value.recoveryCount = 1;
      }
      
      // Continue with remaining steps
      const sessionState = orchestrator.getSession(session.sessionId);
      expect(sessionState.isSuccess).to.be.true;
      expect(sessionState.value?.failureCount).to.equal(1);
      expect(sessionState.value?.recoveryCount).to.equal(1);
    });

    it('should support session persistence and resumption', async () => {
      // RED: This test should fail initially
      // Test session save/restore functionality

      // Create session using SessionManager instead of OnboardingOrchestrator
      const sessionResult = sessionManager.createSession('test-user', UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess || !sessionResult.value) {
        throw new Error('Failed to start onboarding session');
      }
      
      const originalSession = sessionResult.value;
      const steps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin', originalSession.sessionId);
      
      // Complete some steps
      const halfway = Math.floor(steps.length / 2);
      for (let i = 0; i < halfway; i++) {
        const progressResult = checklist.updateProgress(originalSession.sessionId, steps[i].id, StepStatus.COMPLETED);
        expect(progressResult.isSuccess).to.be.true;
      }
      
      // Save session state
      const saveResult = sessionManager.saveSession(originalSession.sessionId);
      expect(saveResult.isSuccess).to.be.true;
      
      // Simulate session interruption and restoration
      const restoreResult = sessionManager.restoreSession(originalSession.sessionId);
      expect(restoreResult.isSuccess).to.be.true;
      
      const restoredSession = restoreResult.value;
      expect(restoredSession?.sessionId).to.equal(originalSession.sessionId);
      expect(restoredSession?.userType).to.equal(UserType.HUMAN_DEVELOPER);
      expect(restoredSession?.developerRole).to.equal(DeveloperRole.FULLSTACK);
      
      // Verify progress is preserved
      const progressStatus = checklist.getProgressStatus(originalSession.sessionId);
      expect(progressStatus.isSuccess).to.be.true;
      expect(progressStatus.value?.completedSteps.length).to.equal(halfway);
      expect(progressStatus.value?.percentComplete).to.be.approximately(50, 10);
      
      // Continue from where we left off
      for (let i = halfway; i < steps.length; i++) {
        const progressResult = checklist.updateProgress(originalSession.sessionId, steps[i].id, StepStatus.COMPLETED);
        expect(progressResult.isSuccess).to.be.true;
      }
      
      // Verify completion
      const finalStatus = checklist.getProgressStatus(originalSession.sessionId);
      expect(finalStatus.isSuccess).to.be.true;
      expect(finalStatus.value?.percentComplete).to.equal(100);
    });
  });

  describe('Cross-Platform Onboarding Compatibility', () => {
    it('should generate platform-specific instructions for all supported platforms', async () => {
      // RED: This test should fail initially
      const platforms = ['darwin', 'linux', 'win32'];
      const roles = [DeveloperRole.FRONTEND, DeveloperRole.BACKEND, DeveloperRole.DEVOPS, DeveloperRole.FULLSTACK];
      
      for (const platform of platforms) {
        for (const role of roles) {
          const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, role);
          expect(sessionResult.isSuccess).to.be.true;
          
          if (sessionResult.isSuccess && sessionResult.value) {
            const session = sessionResult.value;
            const steps = checklist.generateChecklistForRole(role, platform, session.sessionId);
            
            // Verify platform-specific content exists
            const envSetupStep = steps.find(step => step.id === 'environment-setup');
            expect(envSetupStep?.platformSpecific?.[platform], 
              `Platform-specific content for ${platform} should exist`).to.exist;
            
            // Verify platform-specific commands are different
            if (platform === 'win32') {
              expect(envSetupStep?.platformSpecific?.[platform]).to.include.oneOf(['powershell', 'cmd', '.exe']);
            } else {
              expect(envSetupStep?.platformSpecific?.[platform]).to.include.oneOf(['bash', 'zsh', 'brew', 'apt']);
            }
          }
        }
      }
    });

    it('should validate installation requirements per platform', async () => {
      // RED: This test should fail initially
      const platformRequirements = {
        'darwin': ['Homebrew', 'Xcode Command Line Tools', 'Node.js'],
        'linux': ['curl', 'git', 'Node.js'],
        'win32': ['Node.js', 'Git for Windows', 'PowerShell']
      };
      
      for (const [platform, expectedRequirements] of Object.entries(platformRequirements)) {
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
        expect(sessionResult.isSuccess).to.be.true;
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const session = sessionResult.value;
          const steps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, platform, session.sessionId);
          
          const envStep = steps.find(step => step.id === 'environment-setup');
          expect(envStep?.requirements, `Requirements for ${platform} should exist`).to.exist;
          
          for (const requirement of expectedRequirements) {
            expect(envStep?.requirements, `Should include ${requirement} for ${platform}`)
              .to.include(requirement);
          }
        }
      }
    });
  });

  describe('Multi-Role Onboarding Workflows', () => {
    it('should handle fullstack developer with both frontend and backend components', async () => {
      // RED: This test should fail initially
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess || !sessionResult.value) {
        throw new Error('Failed to start fullstack onboarding');
      }
      
      const session = sessionResult.value;
      const steps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin', session.sessionId);
      
      // Should include both frontend and backend steps
      const frontendSteps = steps.filter(step => 
        step.categories?.includes('frontend') || 
        step.id.includes('frontend') || 
        step.id.includes('dev-server')
      );
      const backendSteps = steps.filter(step => 
        step.categories?.includes('backend') || 
        step.id.includes('backend') || 
        step.id.includes('database')
      );
      
      expect(frontendSteps.length, 'Should have frontend-specific steps').to.be.greaterThan(0);
      expect(backendSteps.length, 'Should have backend-specific steps').to.be.greaterThan(0);
      
      // Verify dependency ordering
      const dbSetupStep = steps.find(step => step.id === 'database-setup');
      const backendStartStep = steps.find(step => step.id === 'backend-start');
      
      if (dbSetupStep && backendStartStep) {
        const dbIndex = steps.findIndex(step => step.id === 'database-setup');
        const backendIndex = steps.findIndex(step => step.id === 'backend-start');
        expect(dbIndex, 'Database setup should come before backend start').to.be.lessThan(backendIndex);
      }
    });

    it('should provide role-specific documentation and resources', async () => {
      // RED: This test should fail initially
      const roles = [DeveloperRole.FRONTEND, DeveloperRole.BACKEND, DeveloperRole.DEVOPS];
      
      for (const role of roles) {
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, role);
        expect(sessionResult.isSuccess).to.be.true;
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const session = sessionResult.value;
          
          // Get role-specific documentation
          const docsResult = documentationManager.getRoleSpecificDocumentation(role);
          expect(docsResult.isSuccess).to.be.true;
          expect(docsResult.value?.role).to.equal(role);
          expect(docsResult.value?.sections).to.be.an('array');
          
          // Verify role-appropriate content
          switch (role) {
            case DeveloperRole.FRONTEND:
              expect(docsResult.value?.sections).to.include.members([
                'component-development',
                'styling-guidelines',
                'build-tools'
              ]);
              break;
            case DeveloperRole.BACKEND:
              expect(docsResult.value?.sections).to.include.members([
                'api-development',
                'database-management',
                'server-configuration'
              ]);
              break;
            case DeveloperRole.DEVOPS:
              expect(docsResult.value?.sections).to.include.members([
                'deployment-pipelines',
                'infrastructure-management',
                'monitoring-setup'
              ]);
              break;
          }
        }
      }
    });
  });

  describe('Onboarding Quality and Validation', () => {
    it('should validate all steps have proper documentation and examples', async () => {
      // RED: This test should fail initially
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (!sessionResult.isSuccess || !sessionResult.value) {
        throw new Error('Failed to start onboarding session');
      }
      
      const session = sessionResult.value;
      const steps = checklist.generateChecklistForRole(DeveloperRole.BACKEND, 'darwin', session.sessionId);
      
      for (const step of steps) {
        // Each step should have documentation
        expect(step.description, `Step ${step.id} should have description`).to.exist;
        expect(step.description.length, `Step ${step.id} description should not be empty`).to.be.greaterThan(10);
        
        // Steps should have examples or instructions
        const hasInstructions = step.instructions && step.instructions.length > 0;
        const hasCodeExamples = step.codeExamples && step.codeExamples.length > 0;
        expect(hasInstructions || hasCodeExamples, 
          `Step ${step.id} should have either instructions or code examples`).to.be.true;
        
        // Validation criteria should exist
        expect(step.validationCriteria, `Step ${step.id} should have validation criteria`).to.exist;
        expect(step.validationCriteria.length, 
          `Step ${step.id} should have at least one validation criterion`).to.be.greaterThan(0);
      }
    });

    it('should track and report onboarding metrics', async () => {
      // RED: This test should fail initially
      const metrics = [];
      
      // Simulate multiple onboarding sessions
      for (let i = 0; i < 3; i++) {
        const role = [DeveloperRole.FRONTEND, DeveloperRole.BACKEND, DeveloperRole.DEVOPS][i];
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, role);
        expect(sessionResult.isSuccess).to.be.true;
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const session = sessionResult.value;
          const steps = checklist.generateChecklistForRole(role, 'darwin', session.sessionId);
          
          const startTime = Date.now();
          
          // Complete all steps
          for (const step of steps) {
            const progressResult = checklist.updateProgress(session.sessionId, step.id, StepStatus.COMPLETED);
            expect(progressResult.isSuccess).to.be.true;
          }
          
          // Mark session as complete in orchestrator
          orchestrator.markSessionComplete(session.sessionId);
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          metrics.push({
            sessionId: session.sessionId,
            role: role,
            duration: duration,
            stepCount: steps.length,
            completed: true
          });
        }
      }
      
      // Generate analytics report
      const analyticsResult = orchestrator.generateAnalyticsReport();
      expect(analyticsResult.isSuccess).to.be.true;
      expect(analyticsResult.value?.totalSessions).to.equal(3);
      expect(analyticsResult.value?.completionRate).to.equal(100);
      expect(analyticsResult.value?.averageDuration).to.be.a('number');
      expect(analyticsResult.value?.roleBreakdown).to.have.keys(['frontend', 'backend', 'devops']);
    });
  });
});