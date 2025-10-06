"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const onboarding_orchestrator_1 = require("../src/orchestrator/onboarding-orchestrator");
const types_1 = require("../src/types");
describe('OnboardingOrchestrator', () => {
    let orchestrator;
    beforeEach(() => {
        orchestrator = new onboarding_orchestrator_1.OnboardingOrchestrator();
    });
    describe('startOnboarding', () => {
        it('should create a human developer onboarding session with frontend role', () => {
            (0, chai_1.expect)(orchestrator).to.not.be.undefined;
            if (!orchestrator)
                return;
            const result = orchestrator.startOnboarding(types_1.UserType.HUMAN_DEVELOPER, types_1.DeveloperRole.FRONTEND);
            (0, chai_1.expect)(result.isSuccess).to.be.true;
            if (result.isSuccess) {
                (0, chai_1.expect)(result.value.userType).to.equal(types_1.UserType.HUMAN_DEVELOPER);
                (0, chai_1.expect)(result.value.developerRole).to.equal(types_1.DeveloperRole.FRONTEND);
                (0, chai_1.expect)(result.value.sessionId).to.be.a('string');
                (0, chai_1.expect)(result.value.sessionId.length).to.be.greaterThan(0);
                (0, chai_1.expect)(result.value.startTime).to.be.instanceof(Date);
                (0, chai_1.expect)(result.value.isComplete).to.be.false;
                (0, chai_1.expect)(result.value.completedSteps).to.be.an('array');
                (0, chai_1.expect)(result.value.completedSteps.length).to.equal(0);
            }
        });
        it('should create an AI agent onboarding session without role', () => {
            (0, chai_1.expect)(orchestrator).to.not.be.undefined;
            if (!orchestrator)
                return;
            const result = orchestrator.startOnboarding(types_1.UserType.AI_AGENT);
            (0, chai_1.expect)(result.isSuccess).to.be.true;
            if (result.isSuccess) {
                (0, chai_1.expect)(result.value.userType).to.equal(types_1.UserType.AI_AGENT);
                (0, chai_1.expect)(result.value.developerRole).to.be.undefined;
                (0, chai_1.expect)(result.value.sessionId).to.be.a('string');
                (0, chai_1.expect)(result.value.currentStep).to.equal('context-loading');
            }
        });
        it('should create a backend developer session with appropriate initial step', () => {
            (0, chai_1.expect)(orchestrator).to.not.be.undefined;
            if (!orchestrator)
                return;
            const result = orchestrator.startOnboarding(types_1.UserType.HUMAN_DEVELOPER, types_1.DeveloperRole.BACKEND);
            (0, chai_1.expect)(result.isSuccess).to.be.true;
            if (result.isSuccess) {
                (0, chai_1.expect)(result.value.developerRole).to.equal(types_1.DeveloperRole.BACKEND);
                (0, chai_1.expect)(result.value.currentStep).to.equal('environment-setup');
            }
        });
        it('should generate unique session IDs for multiple sessions', () => {
            (0, chai_1.expect)(orchestrator).to.not.be.undefined;
            if (!orchestrator)
                return;
            const session1 = orchestrator.startOnboarding(types_1.UserType.HUMAN_DEVELOPER, types_1.DeveloperRole.FRONTEND);
            const session2 = orchestrator.startOnboarding(types_1.UserType.HUMAN_DEVELOPER, types_1.DeveloperRole.BACKEND);
            (0, chai_1.expect)(session1.isSuccess).to.be.true;
            (0, chai_1.expect)(session2.isSuccess).to.be.true;
            if (session1.isSuccess && session2.isSuccess) {
                (0, chai_1.expect)(session1.value.sessionId).to.not.equal(session2.value.sessionId);
            }
        });
    });
    describe('detectUserType', () => {
        it('should detect human developer based on interactive prompts', () => {
            (0, chai_1.expect)(orchestrator).to.not.be.undefined;
            if (!orchestrator)
                return;
            const userInput = { role: 'frontend', hasExperience: true };
            const result = orchestrator.detectUserType(userInput);
            (0, chai_1.expect)(result.isSuccess).to.be.true;
            if (result.isSuccess) {
                (0, chai_1.expect)(result.value.userType).to.equal(types_1.UserType.HUMAN_DEVELOPER);
                (0, chai_1.expect)(result.value.recommendedRole).to.equal(types_1.DeveloperRole.FRONTEND);
            }
        });
        it('should detect AI agent based on structured request', () => {
            (0, chai_1.expect)(orchestrator).to.not.be.undefined;
            if (!orchestrator)
                return;
            const agentInput = {
                requestType: 'context',
                capabilities: ['code-analysis', 'documentation-generation']
            };
            const result = orchestrator.detectUserType(agentInput);
            (0, chai_1.expect)(result.isSuccess).to.be.true;
            if (result.isSuccess) {
                (0, chai_1.expect)(result.value.userType).to.equal(types_1.UserType.AI_AGENT);
                (0, chai_1.expect)(result.value.recommendedRole).to.be.undefined;
            }
        });
    });
});
//# sourceMappingURL=onboarding-orchestrator.test.js.map