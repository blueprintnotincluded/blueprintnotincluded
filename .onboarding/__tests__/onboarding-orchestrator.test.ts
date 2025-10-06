import { expect } from 'chai';
import { OnboardingOrchestrator } from '../src/orchestrator/onboarding-orchestrator';
import { UserType, DeveloperRole } from '../src/types';

describe('OnboardingOrchestrator', () => {
  let orchestrator: OnboardingOrchestrator | undefined;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
  });

  describe('startOnboarding', () => {
    it('should create a human developer onboarding session with frontend role', () => {
      expect(orchestrator).to.not.be.undefined;
      if (!orchestrator) return;
      
      const result = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.userType).to.equal(UserType.HUMAN_DEVELOPER);
        expect(result.value.developerRole).to.equal(DeveloperRole.FRONTEND);
        expect(result.value.sessionId).to.be.a('string');
        expect(result.value.sessionId.length).to.be.greaterThan(0);
        expect(result.value.startTime).to.be.instanceof(Date);
        expect(result.value.isComplete).to.be.false;
        expect(result.value.completedSteps).to.be.an('array');
        expect(result.value.completedSteps.length).to.equal(0);
      }
    });

    it('should create an AI agent onboarding session without role', () => {
      expect(orchestrator).to.not.be.undefined;
      if (!orchestrator) return;
      
      const result = orchestrator.startOnboarding(UserType.AI_AGENT);
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.userType).to.equal(UserType.AI_AGENT);
        expect(result.value.developerRole).to.be.undefined;
        expect(result.value.sessionId).to.be.a('string');
        expect(result.value.currentStep).to.equal('context-loading');
      }
    });

    it('should create a backend developer session with appropriate initial step', () => {
      expect(orchestrator).to.not.be.undefined;
      if (!orchestrator) return;
      
      const result = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.developerRole).to.equal(DeveloperRole.BACKEND);
        expect(result.value.currentStep).to.equal('environment-setup');
      }
    });

    it('should generate unique session IDs for multiple sessions', () => {
      expect(orchestrator).to.not.be.undefined;
      if (!orchestrator) return;
      
      const session1 = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
      const session2 = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
      
      expect(session1.isSuccess).to.be.true;
      expect(session2.isSuccess).to.be.true;
      
      if (session1.isSuccess && session2.isSuccess) {
        expect(session1.value.sessionId).to.not.equal(session2.value.sessionId);
      }
    });
  });

  describe('detectUserType', () => {
    it('should detect human developer based on interactive prompts', () => {
      expect(orchestrator).to.not.be.undefined;
      if (!orchestrator) return;
      
      const userInput = { role: 'frontend', hasExperience: true };
      const result = orchestrator.detectUserType(userInput);
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.userType).to.equal(UserType.HUMAN_DEVELOPER);
        expect(result.value.recommendedRole).to.equal(DeveloperRole.FRONTEND);
      }
    });

    it('should detect AI agent based on structured request', () => {
      expect(orchestrator).to.not.be.undefined;
      if (!orchestrator) return;
      
      const agentInput = { 
        requestType: 'context', 
        capabilities: ['code-analysis', 'documentation-generation']
      };
      const result = orchestrator.detectUserType(agentInput);
      
      expect(result.isSuccess).to.be.true;
      if (result.isSuccess) {
        expect(result.value.userType).to.equal(UserType.AI_AGENT);
        expect(result.value.recommendedRole).to.be.undefined;
      }
    });
  });
});