import { expect } from 'chai';
import * as sinon from 'sinon';
import { ProgressTracker, ProcessingStep } from '../../app/api/batch/progress-tracker';

describe('ProgressTracker Tests', () => {
  let progressTracker: ProgressTracker;
  let consoleLogStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    progressTracker = new ProgressTracker();
    consoleLogStub = sinon.stub(console, 'log');
    consoleErrorStub = sinon.stub(console, 'error');
  });

  afterEach(() => {
    consoleLogStub.restore();
    consoleErrorStub.restore();
  });

  describe('Step Registration and Execution', () => {
    it('should register and execute a simple step', async () => {
      let executed = false;
      const step: ProcessingStep = {
        name: 'test-step',
        description: 'Test step',
        retryable: false,
        maxRetries: 0,
        execute: async () => {
          executed = true;
          return true;
        }
      };

      progressTracker.registerStep(step);
      const success = await progressTracker.executeStep('test-step');

      expect(success).to.be.true;
      expect(executed).to.be.true;

      const state = progressTracker.getState();
      expect(state['test-step'].status).to.equal('completed');
      expect(state['test-step'].retryCount).to.equal(0);
    });

    it('should handle step failures correctly', async () => {
      const step: ProcessingStep = {
        name: 'failing-step',
        description: 'Failing step',
        retryable: false,
        maxRetries: 0,
        execute: async () => {
          throw new Error('Test error');
        }
      };

      progressTracker.registerStep(step);
      const success = await progressTracker.executeStep('failing-step');

      expect(success).to.be.false;

      const state = progressTracker.getState();
      expect(state['failing-step'].status).to.equal('failed');
      expect(state['failing-step'].errorMessage).to.equal('Test error');
    });

    it('should retry failed steps when retryable', async () => {
      let attempts = 0;
      const step: ProcessingStep = {
        name: 'retry-step',
        description: 'Retryable step',
        retryable: true,
        maxRetries: 2,
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return true;
        }
      };

      progressTracker.registerStep(step);
      const success = await progressTracker.executeStep('retry-step');

      expect(success).to.be.true;
      expect(attempts).to.equal(3);

      const state = progressTracker.getState();
      expect(state['retry-step'].status).to.equal('completed');
      expect(state['retry-step'].retryCount).to.equal(2);
    });

    it('should fail after max retries', async () => {
      let attempts = 0;
      const step: ProcessingStep = {
        name: 'max-retry-step',
        description: 'Max retry step',
        retryable: true,
        maxRetries: 2,
        execute: async () => {
          attempts++;
          throw new Error(`Attempt ${attempts} failed`);
        }
      };

      progressTracker.registerStep(step);
      const success = await progressTracker.executeStep('max-retry-step');

      expect(success).to.be.false;
      expect(attempts).to.equal(3); // 1 initial + 2 retries

      const state = progressTracker.getState();
      expect(state['max-retry-step'].status).to.equal('failed');
      expect(state['max-retry-step'].retryCount).to.equal(2);
    });
  });

  describe('Dependency Management', () => {
    it('should execute steps in dependency order', async () => {
      const executionOrder: string[] = [];

      const stepA: ProcessingStep = {
        name: 'step-a',
        description: 'Step A',
        retryable: false,
        maxRetries: 0,
        execute: async () => {
          executionOrder.push('step-a');
          return true;
        }
      };

      const stepB: ProcessingStep = {
        name: 'step-b',
        description: 'Step B',
        retryable: false,
        maxRetries: 0,
        dependencies: ['step-a'],
        execute: async () => {
          executionOrder.push('step-b');
          return true;
        }
      };

      const stepC: ProcessingStep = {
        name: 'step-c',
        description: 'Step C',
        retryable: false,
        maxRetries: 0,
        dependencies: ['step-a', 'step-b'],
        execute: async () => {
          executionOrder.push('step-c');
          return true;
        }
      };

      progressTracker.registerStep(stepC);
      progressTracker.registerStep(stepA);
      progressTracker.registerStep(stepB);

      const success = await progressTracker.executeAll();

      expect(success).to.be.true;
      expect(executionOrder).to.deep.equal(['step-a', 'step-b', 'step-c']);
    });

    it('should fail when dependencies are not satisfied', async () => {
      const step: ProcessingStep = {
        name: 'dependent-step',
        description: 'Dependent step',
        retryable: false,
        maxRetries: 0,
        dependencies: ['non-existent-step'],
        execute: async () => true
      };

      progressTracker.registerStep(step);

      // Should throw when trying to execute all (due to missing dependency)
      try {
        await progressTracker.executeAll();
        expect.fail('Should have thrown for missing dependency');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include('unknown step');
      }
    });

    it('should detect circular dependencies', async () => {
      const stepA: ProcessingStep = {
        name: 'step-a',
        description: 'Step A',
        retryable: false,
        maxRetries: 0,
        dependencies: ['step-b'],
        execute: async () => true
      };

      const stepB: ProcessingStep = {
        name: 'step-b',
        description: 'Step B',
        retryable: false,
        maxRetries: 0,
        dependencies: ['step-a'],
        execute: async () => true
      };

      progressTracker.registerStep(stepA);
      progressTracker.registerStep(stepB);

      try {
        await progressTracker.executeAll();
        expect.fail('Should have thrown for circular dependency');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.match(/circular dependency/i);
      }
    });
  });

  describe('Progress Tracking', () => {
    it('should track progress updates', () => {
      const step: ProcessingStep = {
        name: 'progress-step',
        description: 'Progress step',
        retryable: false,
        maxRetries: 0,
        execute: async () => true
      };

      progressTracker.registerStep(step);
      progressTracker.updateProgress('progress-step', 50, 100);

      const state = progressTracker.getState();
      expect(state['progress-step'].progress).to.equal(50);
      expect(state['progress-step'].total).to.equal(100);
    });

    it('should provide accurate summary', async () => {
      const stepSuccess: ProcessingStep = {
        name: 'success-step',
        description: 'Success step',
        retryable: false,
        maxRetries: 0,
        execute: async () => true
      };

      const stepFail: ProcessingStep = {
        name: 'fail-step',
        description: 'Fail step',
        retryable: false,
        maxRetries: 0,
        execute: async () => false
      };

      const stepPending: ProcessingStep = {
        name: 'pending-step',
        description: 'Pending step',
        retryable: false,
        maxRetries: 0,
        execute: async () => true
      };

      progressTracker.registerStep(stepSuccess);
      progressTracker.registerStep(stepFail);
      progressTracker.registerStep(stepPending);

      // Execute only some steps
      await progressTracker.executeStep('success-step');
      await progressTracker.executeStep('fail-step');

      const summary = progressTracker.getSummary();
      expect(summary.total).to.equal(3);
      expect(summary.completed).to.equal(1);
      expect(summary.failed).to.equal(1);
      expect(summary.pending).to.equal(1);
      expect(summary.running).to.equal(0);
    });
  });

  describe('State Management', () => {
    it('should reset state correctly', async () => {
      const step: ProcessingStep = {
        name: 'reset-step',
        description: 'Reset step',
        retryable: false,
        maxRetries: 0,
        execute: async () => true
      };

      progressTracker.registerStep(step);
      await progressTracker.executeStep('reset-step');

      // Verify initial completion
      let state = progressTracker.getState();
      expect(state['reset-step'].status).to.equal('completed');

      // Reset and verify
      progressTracker.reset();
      state = progressTracker.getState();
      expect(state['reset-step'].status).to.equal('pending');
      expect(state['reset-step'].retryCount).to.equal(0);
      expect(state['reset-step'].progress).to.be.undefined;
      expect(state['reset-step'].errorMessage).to.be.undefined;
    });

    it('should cancel running steps', () => {
      const step: ProcessingStep = {
        name: 'cancel-step',
        description: 'Cancel step',
        retryable: false,
        maxRetries: 0,
        execute: async () => true
      };

      progressTracker.registerStep(step);
      
      // Manually set to running state by accessing the internal state
      const state = progressTracker.getState();
      state['cancel-step'].status = 'running';
      
      // We need to access the private state directly for this test
      (progressTracker as any).state.set('cancel-step', state['cancel-step']);

      progressTracker.cancel();

      const finalState = progressTracker.getState();
      expect(finalState['cancel-step'].status).to.equal('failed');
      expect(finalState['cancel-step'].errorMessage).to.equal('Cancelled by user');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown step execution', async () => {
      try {
        await progressTracker.executeStep('unknown-step');
        expect.fail('Should have thrown for unknown step');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include('Unknown step');
      }
    });

    it('should handle steps that return false vs throw errors', async () => {
      const falseStep: ProcessingStep = {
        name: 'false-step',
        description: 'False step',
        retryable: false,
        maxRetries: 0,
        execute: async () => false
      };

      const throwStep: ProcessingStep = {
        name: 'throw-step',
        description: 'Throw step',
        retryable: false,
        maxRetries: 0,
        execute: async () => {
          throw new Error('Explicit error');
        }
      };

      progressTracker.registerStep(falseStep);
      progressTracker.registerStep(throwStep);

      const falseResult = await progressTracker.executeStep('false-step');
      const throwResult = await progressTracker.executeStep('throw-step');

      expect(falseResult).to.be.false;
      expect(throwResult).to.be.false;

      const state = progressTracker.getState();
      expect(state['false-step'].status).to.equal('failed');
      expect(state['false-step'].errorMessage).to.be.undefined;

      expect(state['throw-step'].status).to.equal('failed');
      expect(state['throw-step'].errorMessage).to.equal('Explicit error');
    });
  });
});