import { expect } from 'chai';
import { AchievementSystem } from '../achievements/achievement-system';
import { StepStatus, DeveloperRole } from '../types';

describe('AchievementSystem', () => {
  let achievementSystem: AchievementSystem;

  beforeEach(() => {
    achievementSystem = new AchievementSystem();
  });

  describe('validateStepCompletion', () => {
    it('should validate step completion with prerequisites checking', async () => {
      const sessionId = 'test-session';
      const completedSteps = ['environment-setup'];
      
      const result = await achievementSystem.validateStepCompletion(
        sessionId,
        'dependencies-install',
        { nodeModulesExists: true, packageLockExists: true },
        completedSteps
      );
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.isValid).to.be.true;
      expect(result.value?.prerequisitesMet).to.be.true;
    });

    it('should fail validation when prerequisites are not met', async () => {
      const sessionId = 'test-session';
      const completedSteps: string[] = []; // No prerequisites completed
      
      const result = await achievementSystem.validateStepCompletion(
        sessionId,
        'dependencies-install',
        { nodeModulesExists: true },
        completedSteps
      );
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.isValid).to.be.false;
      expect(result.value?.prerequisitesMet).to.be.false;
      expect(result.value?.missingPrerequisites).to.be.an('array').that.is.not.empty;
    });

    it('should provide detailed validation feedback', async () => {
      const sessionId = 'test-session';
      const completedSteps = ['environment-setup'];
      
      const result = await achievementSystem.validateStepCompletion(
        sessionId,
        'dependencies-install',
        { nodeModulesExists: false },
        completedSteps
      );
      
      expect(result.value?.validationDetails).to.exist;
      expect(result.value?.errors).to.be.an('array');
      expect(result.value?.suggestions).to.be.an('array');
    });
  });

  describe('trackMilestone', () => {
    it('should record milestone achievement', () => {
      const sessionId = 'test-session';
      const milestoneId = 'environment-ready';
      
      const result = achievementSystem.trackMilestone(sessionId, milestoneId, {
        name: 'Environment Setup Complete',
        description: 'Successfully configured development environment',
        category: 'setup'
      });
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.milestoneId).to.equal(milestoneId);
      expect(result.value?.achievedAt).to.be.a('date');
    });

    it('should calculate milestone significance', () => {
      const sessionId = 'test-session';
      
      const result = achievementSystem.trackMilestone(sessionId, 'first-successful-build', {
        name: 'First Successful Build',
        description: 'Built the project successfully for the first time',
        category: 'development'
      });
      
      expect(result.value?.significance).to.exist;
      expect(result.value?.significance).to.be.oneOf(['minor', 'major', 'critical']);
    });
  });

  describe('generateCertificate', () => {
    it('should generate completion certificate for finished onboarding', () => {
      const sessionId = 'test-session';
      const completedSteps = ['environment-setup', 'dependencies-install', 'first-build', 'tests-passing'];
      const milestones = ['environment-ready', 'dependencies-ready', 'build-ready', 'test-ready'];
      
      const result = achievementSystem.generateCertificate(
        sessionId,
        'user123',
        DeveloperRole.FRONTEND,
        completedSteps,
        milestones
      );
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.certificateId).to.exist;
      expect(result.value?.completionDate).to.be.a('date');
      expect(result.value?.achievements).to.be.an('array');
      expect(result.value?.skillsValidated).to.be.an('array');
    });

    it('should include performance metrics in certificate', () => {
      const sessionId = 'test-session';
      const completedSteps = ['environment-setup', 'dependencies-install'];
      
      const result = achievementSystem.generateCertificate(
        sessionId,
        'user123',
        DeveloperRole.BACKEND,
        completedSteps,
        [],
        45 // completion time in minutes
      );
      
      expect(result.value?.metrics).to.exist;
      expect(result.value?.metrics?.completionTime).to.equal(45);
      expect(result.value?.metrics?.efficiency).to.exist;
    });

    it('should fail to generate certificate for incomplete onboarding', () => {
      const sessionId = 'test-session';
      const incompleteSteps = ['environment-setup']; // Missing required steps
      
      const result = achievementSystem.generateCertificate(
        sessionId,
        'user123',
        DeveloperRole.FRONTEND,
        incompleteSteps,
        []
      );
      
      expect(result.isSuccess).to.be.false;
      expect(result.error?.code).to.equal('INCOMPLETE_ONBOARDING');
    });
  });

  describe('generateProgressReport', () => {
    it('should create detailed progress visualization', () => {
      const sessionId = 'test-session';
      const completedSteps = ['environment-setup', 'dependencies-install'];
      const totalSteps = 8;
      
      const result = achievementSystem.generateProgressReport(
        sessionId,
        completedSteps,
        totalSteps,
        DeveloperRole.FRONTEND
      );
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.sessionId).to.equal(sessionId);
      expect(result.value?.percentComplete).to.equal(25); // 2/8 * 100
      expect(result.value?.completedSteps).to.deep.equal(completedSteps);
      expect(result.value?.nextSteps).to.be.an('array');
    });

    it('should include recommendations for next actions', () => {
      const sessionId = 'test-session';
      const completedSteps = ['environment-setup'];
      
      const result = achievementSystem.generateProgressReport(
        sessionId,
        completedSteps,
        5,
        DeveloperRole.DEVOPS
      );
      
      expect(result.value?.recommendations).to.be.an('array');
      expect(result.value?.blockers).to.be.an('array');
      expect(result.value?.estimatedTimeToCompletion).to.be.a('number');
    });
  });

  describe('persistAchievements', () => {
    it('should save achievement data to filesystem', async () => {
      const sessionId = 'test-session';
      
      // Track some milestones first
      achievementSystem.trackMilestone(sessionId, 'milestone1', { name: 'Test', description: 'Test', category: 'test' });
      
      const result = await achievementSystem.persistAchievements(sessionId);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value?.filePath).to.exist;
      expect(result.value?.achievementCount).to.be.greaterThan(0);
    });
  });

  describe('getHistoricalAchievements', () => {
    it('should retrieve past achievements for a user', async () => {
      const userId = 'user123';
      
      const result = await achievementSystem.getHistoricalAchievements(userId);
      
      expect(result.isSuccess).to.be.true;
      expect(result.value).to.be.an('array');
    });

    it('should aggregate achievements across multiple sessions', async () => {
      const userId = 'user123';
      
      // This would test loading multiple session achievement files
      const result = await achievementSystem.getHistoricalAchievements(userId);
      
      expect(result.value).to.be.an('array');
      // Each item should have session info and achievements
      if (result.value && result.value.length > 0) {
        expect(result.value[0]).to.have.property('sessionId');
        expect(result.value[0]).to.have.property('achievements');
      }
    });
  });
});