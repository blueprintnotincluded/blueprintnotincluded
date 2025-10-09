import { expect } from 'chai';
import { ProgressiveChecklist } from '../checklist/progressive-checklist';
import { ChecklistStep, StepStatus, StepValidationResult, DeveloperRole } from '../types';

describe('ProgressiveChecklist', () => {
  let checklist: ProgressiveChecklist;

  beforeEach(() => {
    checklist = new ProgressiveChecklist();
  });

  describe('generateChecklistForRole', () => {
    it('should generate platform-specific installation instructions for frontend role', () => {
      const steps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin');
      
      expect(steps).to.be.an('array');
      expect(steps.length).to.be.greaterThan(0);
      
      // Should include environment setup step
      const envStep = steps.find((step: any) => step.id === 'environment-setup');
      expect(envStep).to.exist;
      expect(envStep?.platformSpecific).to.have.property('darwin');
    });

    it('should generate different instructions for different platforms', () => {
      const darwinSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin');
      const linuxSteps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'linux');
      
      const darwinEnvStep = darwinSteps.find((step: any) => step.id === 'environment-setup');
      const linuxEnvStep = linuxSteps.find((step: any) => step.id === 'environment-setup');
      
      expect(darwinEnvStep?.platformSpecific?.darwin).to.not.equal(linuxEnvStep?.platformSpecific?.linux);
    });

    it('should include contextual help for each step', () => {
      const steps = checklist.generateChecklistForRole(DeveloperRole.BACKEND, 'darwin');
      
      steps.forEach((step: any) => {
        expect(step.contextualHelp).to.exist;
        expect(step.contextualHelp).to.be.an('array');
        expect(step.contextualHelp.length).to.be.greaterThan(0);
      });
    });
  });

  describe('validateStepCompletion', () => {
    it('should validate environment setup completion', async () => {
      const stepId = 'environment-setup';
      const result = await checklist.validateStepCompletion(stepId, {
        nodeVersion: '20.18.0',
        npmVersion: '10.0.0'
      });
      
      expect(result.isValid).to.be.true;
      expect(result.validationDetails).to.have.property('nodeVersion');
    });

    it('should fail validation for incorrect node version', async () => {
      const stepId = 'environment-setup';
      const result = await checklist.validateStepCompletion(stepId, {
        nodeVersion: '18.0.0',
        npmVersion: '10.0.0'
      });
      
      expect(result.isValid).to.be.false;
      expect(result.errors.some(error => error.includes('Node.js version'))).to.be.true;
    });

    it('should validate dependencies installation', async () => {
      const stepId = 'dependencies-install';
      const result = await checklist.validateStepCompletion(stepId, {
        nodeModulesExists: true,
        packageLockExists: true
      });
      
      expect(result.isValid).to.be.true;
    });
  });

  describe('updateProgress', () => {
    it('should mark step as completed and unlock next step', () => {
      const sessionId = 'test-session';
      const stepId = 'environment-setup';
      
      // Initialize session with steps
      checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin', sessionId);
      
      const result = checklist.updateProgress(sessionId, stepId, StepStatus.COMPLETED);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.currentStep).to.equal(stepId);
      expect(result.value?.nextStep).to.exist;
    });

    it('should calculate correct completion percentage', () => {
      const sessionId = 'test-session-2';
      const steps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin', sessionId);
      
      // Complete first step
      checklist.updateProgress(sessionId, steps[0].id, StepStatus.COMPLETED);
      
      const progress = checklist.getProgress(sessionId);
      expect(progress.value?.percentComplete).to.equal(Math.round((1 / steps.length) * 100));
    });

    it('should prevent advancing to locked steps', () => {
      const sessionId = 'test-session-3';
      const steps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin', sessionId);
      
      // Try to complete third step without completing first two
      const result = checklist.updateProgress(sessionId, steps[2].id, StepStatus.COMPLETED);
      
      expect(result.isSuccess).to.be.false;
      expect(result.error?.code).to.equal('STEP_LOCKED');
    });
  });

  describe('provideContextualHelp', () => {
    it('should provide role-specific help resources', () => {
      const help = checklist.provideContextualHelp('environment-setup', DeveloperRole.FRONTEND);
      
      expect(help).to.be.an('array');
      expect(help.some(item => /frontend/i.test(item))).to.be.true;
    });

    it('should provide troubleshooting steps for common issues', () => {
      const help = checklist.provideContextualHelp('dependencies-install', DeveloperRole.BACKEND);
      
      expect(help.some(item => /npm.*error/i.test(item))).to.be.true;
    });
  });

  describe('integration with existing onboarding system', () => {
    it('should generate steps that can be used with session tracking', () => {
      const steps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin');
      
      expect(steps[0]).to.have.property('id');
      expect(steps[0]).to.have.property('status');
      expect(steps[0]).to.have.property('dependencies');
    });
  });
});