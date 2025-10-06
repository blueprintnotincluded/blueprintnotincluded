import { expect } from 'chai';
import { OnboardingOrchestrator } from '../orchestrator/onboarding-orchestrator';
import { ProgressiveChecklist } from '../checklist/progressive-checklist';
import { UserType, DeveloperRole, StepStatus } from '../types';

describe('Integration Tests', () => {
  let orchestrator: OnboardingOrchestrator;
  let checklist: ProgressiveChecklist;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
    checklist = new ProgressiveChecklist();
  });

  describe('OnboardingOrchestrator + ProgressiveChecklist Integration', () => {
    it('should create session and generate compatible checklist', () => {
      // Create onboarding session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        
        // Generate checklist for the session
        const steps = checklist.generateChecklistForRole(
          DeveloperRole.FRONTEND, 
          'darwin', 
          session.sessionId
        );
        
        expect(steps.length).to.be.greaterThan(0);
        expect(steps[0].sessionId).to.equal(session.sessionId);
        expect(steps[0].status).to.equal(StepStatus.AVAILABLE);
      }
    });

    it('should track progress through checklist steps', () => {
      // Create session
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        
        // Generate checklist
        const steps = checklist.generateChecklistForRole(
          DeveloperRole.BACKEND, 
          'darwin', 
          session.sessionId
        );
        
        // Complete first step
        const progressResult = checklist.updateProgress(
          session.sessionId, 
          steps[0].id, 
          StepStatus.COMPLETED
        );
        
        expect(progressResult.isSuccess).to.be.true;
        expect(progressResult.value?.percentComplete).to.be.greaterThan(0);
      }
    });

    it('should provide role-specific guidance for different user types', () => {
      const roles = [DeveloperRole.FRONTEND, DeveloperRole.BACKEND, DeveloperRole.DEVOPS, DeveloperRole.FULLSTACK];
      
      roles.forEach(role => {
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, role);
        expect(sessionResult.isSuccess).to.be.true;
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const steps = checklist.generateChecklistForRole(role, 'darwin');
          expect(steps.length).to.be.greaterThan(0);
          
          // Each role should have different step counts or configurations
          const help = checklist.provideContextualHelp('environment-setup', role);
          expect(help).to.be.an('array');
          expect(help.length).to.be.greaterThan(0);
        }
      });
    });

    it('should handle AI agent onboarding differently from human developers', () => {
      // Human developer session
      const humanResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      expect(humanResult.isSuccess).to.be.true;
      
      // AI agent session  
      const agentResult = orchestrator.startOnboarding(UserType.AI_AGENT);
      expect(agentResult.isSuccess).to.be.true;
      
      if (humanResult.isSuccess && agentResult.isSuccess && humanResult.value && agentResult.value) {
        // Different initial steps for different user types
        expect(humanResult.value.currentStep).to.not.equal(agentResult.value.currentStep);
        
        // Human gets progressive checklist, AI gets context loading
        expect(humanResult.value.currentStep).to.equal('environment-setup');
        expect(agentResult.value.currentStep).to.equal('context-loading');
      }
    });
  });

  describe('Platform and Role Compatibility', () => {
    it('should generate different platform instructions for same role', () => {
      const darwinSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin');
      const linuxSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'linux');
      const windowsSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'win32');
      
      const darwinSetup = darwinSteps.find(step => step.id === 'environment-setup');
      const linuxSetup = linuxSteps.find(step => step.id === 'environment-setup');
      const windowsSetup = windowsSteps.find(step => step.id === 'environment-setup');
      
      expect(darwinSetup?.platformSpecific?.darwin).to.not.equal(linuxSetup?.platformSpecific?.linux);
      expect(linuxSetup?.platformSpecific?.linux).to.not.equal(windowsSetup?.platformSpecific?.win32);
    });

    it('should generate different step sets for different roles', () => {
      const frontendSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin');
      const backendSteps = checklist.generateChecklistForRole(DeveloperRole.BACKEND, 'darwin');
      const devopsSteps = checklist.generateChecklistForRole(DeveloperRole.DEVOPS, 'darwin');
      const fullstackSteps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin');
      
      // Fullstack should have more steps than individual roles
      expect(fullstackSteps.length).to.be.greaterThan(frontendSteps.length);
      
      // Backend should have database setup, frontend should not
      const backendDb = backendSteps.find(step => step.id === 'database-setup');
      const frontendDb = frontendSteps.find(step => step.id === 'database-setup');
      
      expect(backendDb).to.exist;
      expect(frontendDb).to.be.undefined;
      
      // Frontend should have dev-server-start, backend should not
      const frontendDevServer = frontendSteps.find(step => step.id === 'dev-server-start');
      const backendDevServer = backendSteps.find(step => step.id === 'dev-server-start');
      
      expect(frontendDevServer).to.exist;
      expect(backendDevServer).to.be.undefined;
      
      // DevOps should have infrastructure setup
      const devopsInfra = devopsSteps.find(step => step.id === 'infrastructure-setup');
      expect(devopsInfra).to.exist;
    });
  });
});